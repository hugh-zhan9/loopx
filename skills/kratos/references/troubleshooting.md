# Troubleshooting

Guide for common Kratos issues and debugging techniques.

## When to Use

- Route override problems
- Zero-value field issues
- Validation errors on partial updates
- Enum display issues
- Debugging runtime behavior

---

## Route Override Issue

### Problem

Generic routes shadow specific routes when defined first:

```protobuf
// WRONG: specific route shadowed
rpc GetUser(GetUserRequest) returns (User) {
    option (google.api.http) = {get: "/v1/user/{user_id}"};  // Matches "profile"!
}
rpc GetProfile(GetProfileRequest) returns (Profile) {
    option (google.api.http) = {get: "/v1/user/profile"};    // Never matched
}
```

### Solution

Define specific routes before generic ones:

```protobuf
// CORRECT: specific route first
rpc GetProfile(GetProfileRequest) returns (Profile) {
    option (google.api.http) = {get: "/v1/user/profile"};    // Matches first
}
rpc GetUser(GetUserRequest) returns (User) {
    option (google.api.http) = {get: "/v1/user/{user_id}"};  // Matches remaining
}
```

**Why this matters:** HTTP routers match in order. `{user_id}` is a wildcard that matches any string including "profile".

---

## Zero-Value Field Issue

### Problem

Protobuf by default omits fields with zero values (empty string, 0, false, nil):

```go
// Proto message
message User {
    string name = 1;
    int32 age = 2;
}

// Response
{name: "", age: 0}

// JSON output: {}  // Empty! All fields omitted.
```

### Solution 1: EmitUnpopulated

```go
import "google.golang.org/protobuf/encoding/protojson"

var MarshalOptions = protojson.MarshalOptions{
    EmitUnpopulated: true,  // Include zero values
}

// Custom codec
func (codec) Marshal(v interface{}) ([]byte, error) {
    if m, ok := v.(proto.Message); ok {
        return MarshalOptions.Marshal(m)
    }
    return json.Marshal(v)
}
```

### Solution 2: anypb.New Wrapper

```go
import "google.golang.org/protobuf/types/known/anypb"

payload, err := anypb.New(m)
reply.Data = payload
```

**Note:** Adds `@type` field: `{"@type": "type.googleapis.com/...", "value": {...}}`

### Solution 3: Remove omitempty

```bash
# Makefile - remove omitempty from pb.go tags
find ./api -name '*.pb.go' -exec sed -i -e "s/,omitempty/,optional/g" {} \;
```

---

## Partial Update Validation Issue

### Problem

Validate middleware checks all fields, but partial updates (PATCH) may only send some:

```protobuf
message UpdateUserRequest {
    string user_id = 1 [(buf.validate.field).string.min_len = 1];  // Required
    string name = 2 [(buf.validate.field).string.min_len = 1];     // Required
    string email = 3 [(buf.validate.field).string.email = true];   // Required
}

// PATCH request only sends name
{name: "John", user_id: "123", email: ""}  // Fails validation! email is required.
```

### Solution 1: Whitelist Operations

Skip validation for specific operations:

```go
func WhitelistValidateMiddleware(whitelist map[string]bool) middleware.Middleware {
    return func(handler middleware.Handler) middleware.Handler {
        return func(ctx context.Context, req interface{}) (interface{}, error) {
            if tr, ok := transport.FromServerContext(ctx); ok {
                if whitelist[tr.Operation()] {
                    return handler(ctx, req)  // Skip validation
                }
            }
            // Normal validation
            if err := validator.Validate(req); err != nil {
                return nil, err
            }
            return handler(ctx, req)
        }
    }
}

// Usage
whitelist := map[string]bool{
    "/api.v1.UserService/PatchUser": true,
}
```

### Solution 2: Manual Validation

Validate only changed fields in biz layer:

```go
func (uc *UserUseCase) PatchUser(ctx context.Context, req *v1.PatchUserRequest) error {
    // Only validate if field is set
    if req.Name != "" && len(req.Name) < 1 {
        return errors.New(400, "INVALID_NAME", "name too short")
    }
    if req.Email != "" && !isValidEmail(req.Email) {
        return errors.New(400, "INVALID_EMAIL", "invalid email")
    }
}
```

---

## Enum as String Issue

### Problem

Custom ResponseEncoder may display enums as strings instead of numbers:

```protobuf
enum Status {
    UNKNOWN = 0;
    ACTIVE = 1;
}

// Expected JSON: {"status": 1}
// Actual JSON: {"status": "ACTIVE"}  // String!
```

### Solution: UseEnumNumbers

```go
var MarshalOptions = protojson.MarshalOptions{
    EmitUnpopulated: true,
    UseEnumNumbers:  true,  // Enums as numbers
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

---

## HTTP Proto Unsupported Scenarios

### Problem

Some HTTP features can't be expressed in proto:

- File upload (multipart/form-data)
- WebSocket upgrade
- Server-Sent Events (SSE)
- Custom authentication flows

### Solution: Custom Routes

```go
func NewHTTPServer(c *conf.Server, svc *service.MyService) *http.Server {
    srv := http.NewServer(
        http.Address(c.Http.Addr),
        http.Middleware(
            recovery.Recovery(),
            auth.Token(),
        ),
    )
    
    // Proto-generated routes
    v1.RegisterMyServiceHTTPServer(srv, svc)
    
    // Custom routes (inherit middleware)
    route := srv.Route("/")
    route.POST("/v1/upload", svc.UploadFile)
    route.GET("/v1/ws", svc.WebSocketHandler)
    
    return srv
}

func (s *MyService) UploadFile(ctx http.Context) error {
    http.SetOperation(ctx, "/upload.v1.UploadService/Upload")
    
    // Use ctx.Middleware to inherit server middleware
    h := ctx.Middleware(func(ctx context.Context, req interface{}) (interface{}, error) {
        return s.uc.Upload(ctx, req.(*UploadRequest))
    })
    
    resp, err := h(ctx, parseUploadRequest(ctx))
    return ctx.JSON(200, resp)
}
```

---

## Debugging Tools

### statsviz - Real-time Runtime Metrics

Visualize Go runtime metrics in browser:

```go
import "github.com/arl/statsviz"

func newApp(logger log.Logger, hs *http.Server, gs *grpc.Server) *kratos.App {
    statsviz.RegisterDefault()  // Register /debug/statsviz/
    
    return kratos.New(
        kratos.Name("my-app"),
        kratos.Server(hs, gs),
    )
}
```

Access at: `http://localhost:8000/debug/statsviz/`

Shows:
- Heap allocation
- Goroutine count
- GC pauses
- CPU usage
- Scheduler latency

### fgtrace - Timeline Profiler

```go
import "github.com/felixge/fgtrace"

// Enable in development only (causes stop-the-world pauses)
func init() {
    if os.Getenv("ENV") == "dev" {
        fgtrace.Start()
    }
}
```

### pprof - Standard Go Profiler

Built into Kratos HTTP server:

```go
import "net/http/pprof"

// Automatically available at /debug/pprof/
// - /debug/pprof/heap - memory profile
// - /debug/pprof/goroutine - goroutine profile
// - /debug/pprof/profile?seconds=30 - CPU profile
// - /debug/pprof/trace - execution trace
```

---

## Common Error Patterns

### Error Creation

```go
import "github.com/go-kratos/kratos/v2/errors"

// Standard errors
var ErrUserNotFound = errors.NotFound("USER_NOT_FOUND", "user not found")

// With details
func (uc *UserUseCase) GetUser(ctx context.Context, id string) (*User, error) {
    user, err := uc.repo.FindByID(ctx, id)
    if err != nil {
        return nil, errors.NotFound("USER_NOT_FOUND", "user %s not found", id)
    }
    return user, nil
}
```

### Error Response Format

```json
{
    "code": 404,
    "reason": "USER_NOT_FOUND",
    "message": "user 123 not found",
    "metadata": {
        "user_id": "123"
    }
}
```

### Error Checking

```go
// Check error type
if errors.Is(err, v1.ErrUserNotFound) {
    // Handle user not found
}

// Check error code
if se := errors.FromError(err); se.Code == 404 {
    // Handle not found
}
```

---

## gRPC Error Mapping

Kratos HTTP gateway maps HTTP status to gRPC status:

| HTTP Status | gRPC Status |
|-------------|-------------|
| 400 | InvalidArgument |
| 401 | Unauthenticated |
| 403 | PermissionDenied |
| 404 | NotFound |
| 409 | AlreadyExists |
| 500 | Internal |
| 503 | Unavailable |

```go
// Create HTTP-compatible error
errors.BadRequest("INVALID_PARAM", "invalid parameter")
// → HTTP 400, gRPC InvalidArgument

errors.Unauthenticated("TOKEN_EXPIRED", "token expired")
// → HTTP 401, gRPC Unauthenticated
```