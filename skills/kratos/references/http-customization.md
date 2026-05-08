# HTTP Customization

Guide for customizing HTTP responses, file handling, WebSocket, and CORS.

## When to Use

- Customizing response format
- Handling file upload/download
- WebSocket integration
- CORS configuration
- Static file serving

---

## ResponseEncoder

Customize how successful responses are serialized:

### Standard Pattern

```go
import (
    "github.com/go-kratos/kratos/v2/encoding"
    "github.com/go-kratos/kratos/v2/transport/http"
    "google.golang.org/protobuf/proto"
    "google.golang.org/protobuf/types/known/anypb"
)

func CustomResponseEncoder() http.ServerOption {
    return http.ResponseEncoder(func(w http.ResponseWriter, r *http.Request, i interface{}) error {
        // Handle redirect first
        if rd, ok := i.(http.Redirector); ok {
            url, code := rd.Redirect()
            http.Redirect(w, r, url, code)
            return nil
        }
        
        // Wrap in BaseResponse
        reply := &v1.BaseResponse{Code: 0}
        if m, ok := i.(proto.Message); ok {
            payload, err := anypb.New(m)
            if err != nil {
                return err
            }
            reply.Data = payload
        }
        
        codec := encoding.GetCodec("json")
        data, err := codec.Marshal(reply)
        if err != nil {
            return err
        }
        w.Header().Set("Content-Type", "application/json")
        if _, err := w.Write(data); err != nil {
            return err
        }
        return nil
    })
}
```

### Proto Definition for BaseResponse

```protobuf
import "google/protobuf/any.proto";

message BaseResponse {
    int32 code = 1 [json_name = "code"];
    google.protobuf.Any data = 2 [json_name = "data"];
    string message = 3 [json_name = "message"];
}
```

### Registration

```go
srv := http.NewServer(
    http.Address(":8000"),
    CustomResponseEncoder(),
)
```

---

## ErrorEncoder

Customize how errors are serialized:

```go
func CustomErrorEncoder() http.ServerOption {
    return http.ErrorEncoder(func(w http.ResponseWriter, r *http.Request, err error) {
        // Convert Kratos error to custom format
        se := errors.FromError(err)
        
        reply := &v1.BaseResponse{
            Code:    se.Code,
            Message: se.Message,
        }
        
        codec := encoding.GetCodec("json")
        data, err := codec.Marshal(reply)
        if err != nil {
            w.WriteHeader(http.StatusInternalServerError)
            return
        }
        
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(se.StatusCode)
        if _, err := w.Write(data); err != nil {
            log.Errorf("write error response failed: %v", err)
        }
    })
}
```

---

## Zero-Value Field Handling

Protobuf by default omits zero-value fields. Solutions:

### Option 1: EmitUnpopulated

```go
// Custom json codec with EmitUnpopulated
import "google.golang.org/protobuf/encoding/protojson"

var MarshalOptions = protojson.MarshalOptions{
    EmitUnpopulated: true,  // Include zero values
    UseEnumNumbers:  true,  // Enums as numbers, not strings
}

type codec struct{}

func (codec) Marshal(v interface{}) ([]byte, error) {
    if m, ok := v.(proto.Message); ok {
        return MarshalOptions.Marshal(m)
    }
    return json.Marshal(v)
}

func init() {
    encoding.RegisterCodec(codec{})
}
```

### Option 2: anypb.New Wrapper

```go
// In ResponseEncoder, wrap with anypb.New
payload, err := anypb.New(m)
if err != nil {
    return err
}
reply.Data = payload
```

**Note:** This adds `@type` field to response.

### Option 3: Remove omitempty from pb.go

```bash
# Makefile
ifeq ($(GOHOSTOS), darwin)
    find ./api -name '*.pb.go' -exec sed -i "" -e "s/,omitempty/,optional/g" {} \;
else
    find ./api -name '*.pb.go' -exec sed -i -e "s/,omitempty/,optional/g" {} \;
endif
```

---

## File Upload

Proto doesn't support file upload. Use custom route:

### Handler Pattern

```go
import (
    "bytes"
    "github.com/gorilla/schema"
    "io"
    "net/http"
)

func UploadHandlerWithMiddleware[T comparable](ctx http.Context, fileFormKey string) (
    chain middleware.Middleware,
    request T,
    reader io.Reader,
    filename string,
    err error,
) {
    if fileFormKey == "" {
        fileFormKey = "file"
    }
    
    // Read file
    file, fileHeader, err := ctx.Request().FormFile(fileFormKey)
    defer file.Close()
    if err != nil {
        return nil, request, nil, "", err
    }
    
    // Buffer file content
    buf := new(bytes.Buffer)
    if _, err := io.Copy(buf, file); err != nil {
        return nil, request, nil, fileHeader.Filename, err
    }
    
    // Parse form parameters
    if err := ctx.Request().ParseForm(); err != nil {
        return nil, request, nil, "", err
    }
    
    // Decode form to struct
    var decoder = schema.NewDecoder()
    t := new(T)
    if err := decoder.Decode(t, ctx.Request().Form); err == nil {
        request = *t
    }
    
    h := ctx.Middleware
    return h, request, bytes.NewReader(buf.Bytes()), fileHeader.Filename, nil
}
```

### Service Implementation

```go
func (s *UploadService) RegisterUploadServiceHttpServer(svr *http.Server) {
    route := svr.Route("/")
    route.POST("/v1/upload", s.uploadFile)
}

func (s *UploadService) uploadFile(ctx http.Context) error {
    http.SetOperation(ctx, "/upload.v1.UploadService/Upload")
    
    h, opt, reader, filename, err := UploadHandlerWithMiddleware[biz.UploadOption](ctx, "file")
    if err != nil {
        return v1.ErrorInvalidUploadRequest("invalid request: %v", err)
    }
    
    handler := s.uc.UploadFile(filename, reader, opt)
    resp, err := h(ctx, opt)
    if err != nil {
        return err
    }
    
    return ctx.JSON(200, resp)
}
```

---

## File Download / Redirect

### Redirector Interface

For redirects, implement `http.Redirector`:

```protobuf
message LuckySearchResponse {
    string redirect_to = 1 [(buf.validate.field).string.uri = true];
    int32 status_code = 2;
}
```

```go
// api/helloworld/v1/lucky_search_redirect_impl.go
package v1

import "github.com/go-kratos/kratos/v2/transport/http"

var _ http.Redirector = (*LuckySearchResponse)(nil)

func (s *LuckySearchResponse) Redirect() (string, int) {
    return s.RedirectTo, int(s.StatusCode)
}
```

In ResponseEncoder, handle Redirector first:

```go
if rd, ok := i.(http.Redirector); ok {
    url, code := rd.Redirect()
    http.Redirect(w, r, url, code)
    return nil
}
```

### File Download

```go
// In ResponseEncoder
if asset, ok := i.(*attachment.Attachment); ok {
    w.Header().Set("Content-Disposition", asset.FileName)
    w.Header().Set("Content-Length", strconv.FormatInt(asset.ContentLength, 10))
    w.Header().Set("Content-Type", "application/octet-stream")
    w.Write(asset.Payload)
    return nil
}
```

Proto for attachment:
```protobuf
message Attachment {
    string file_name = 1;
    int64 content_length = 2;
    bytes payload = 3;
}
```

---

## WebSocket

### Server Setup

```go
import (
    "github.com/go-kratos/kratos/v2"
    "github.com/go-kratos/kratos/v2/transport/http"
    "github.com/gorilla/mux"
    "github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool {
        return true  // Allow all origins (configure for production)
    },
}

func main() {
    router := mux.NewRouter()
    router.HandleFunc("/ws", WsHandler)
    
    httpSrv := http.NewServer(http.Address(":8000"))
    httpSrv.HandlePrefix("/", router)
    
    app := kratos.New(
        kratos.Name("ws"),
        kratos.Server(httpSrv),
    )
    app.Run()
}

func WsHandler(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Print("upgrade:", err)
        return
    }
    defer conn.Close()
    
    for {
        mt, message, err := conn.ReadMessage()
        if err != nil {
            log.Println("read:", err)
            break
        }
        log.Printf("recv: %s", message)
        err = conn.WriteMessage(mt, message)
        if err != nil {
            log.Println("write:", err)
            break
        }
    }
}
```

### From Service Layer

```go
func (s *MyService) HandleWebSocket(ctx context.Context, req *v1.WsRequest) error {
    if httpCtx, ok := ctx.(http.Context); ok {
        return s.uc.HandleWebSocket(req.Id, httpCtx)
    }
    return errors.New("not http context")
}

// UseCase
func (uc *MyUseCase) HandleWebSocket(id string, httpCtx http.Context) error {
    conn, err := upgrader.Upgrade(httpCtx.Response(), httpCtx.Request(), nil)
    if err != nil {
        return err
    }
    go handleWsMessage(ctx, id, conn)  // Pass context for cancellation
    return nil
}

func handleWsMessage(ctx context.Context, id string, conn *websocket.Conn) {
    defer conn.Close()
    for {
        select {
        case <-ctx.Done():
            return  // Graceful shutdown
        default:
            mt, message, err := conn.ReadMessage()
            if err != nil {
                return  // Connection closed
            }
            conn.WriteMessage(mt, message)
        }
    }
}
```

---

## CORS Configuration

### Using gorilla/handlers

```go
import "github.com/gorilla/handlers"

srv := http.NewServer(
    http.Address(":8000"),
    http.Filter(handlers.CORS(
        handlers.AllowedHeaders([]string{"X-Requested-With", "Content-Type", "Authorization"}),
        handlers.AllowedMethods([]string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}),
        handlers.AllowedOrigins([]string{"*"}),
    )),
)
```

### Using rs/cors

```go
import "github.com/rs/cors"

func CorsHandler() func(http.Handler) http.Handler {
    c := cors.New(cors.Options{
        AllowedOrigins:   []string{"https://example.com"},
        AllowCredentials: true,
        AllowedHeaders:   []string{"Content-Type", "Authorization"},
        AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE"},
    })
    return c.Handler
}

srv := http.NewServer(
    http.Address(":8000"),
    http.Filter(CorsHandler()),
)
```

---

## Static File Serving

### Using embed.FS

```go
import (
    "embed"
    "net/http"
    "github.com/gorilla/mux"
)

//go:embed assets/*
var f embed.FS

func main() {
    router := mux.NewRouter()
    router.PathPrefix("/assets").Handler(http.FileServer(http.FS(f)))
    
    httpSrv := http.NewServer(http.Address(":8000"))
    httpSrv.HandlePrefix("/", router)
    
    app := kratos.New(
        kratos.Name("static"),
        kratos.Server(httpSrv),
    )
    app.Run()
}
```

---

## TLS Configuration

### Manual TLS

```go
import "crypto/tls"

func LoadTLSConfig(certFile, keyFile string) (*tls.Config, error) {
    cer, err := tls.LoadX509KeyPair(certFile, keyFile)
    if err != nil {
        return nil, err
    }
    return &tls.Config{Certificates: []tls.Certificate{cer}}, nil
}

srv := http.NewServer(
    http.Address(":443"),
    http.TLSConfig(LoadTLSConfig("cert.pem", "key.pem")),
)
```

### Auto TLS (Let's Encrypt)

```go
import "github.com/go-kratos/kratos/v2/transport/http/auto"

// Requires port 443
srv := http.NewServer(
    http.Address(":443"),
    auto.TLSConfig("example.com"),
)