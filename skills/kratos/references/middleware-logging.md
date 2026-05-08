# Middleware & Logging

Guide for middleware development and log management in Kratos.

## When to Use

- Creating custom middleware
- Extracting request context
- Setting up log filtering
- Configuring middleware chains

---

## Middleware Skeleton

### Basic Structure

```go
import (
    "context"
    "github.com/go-kratos/kratos/v2/middleware"
    "github.com/go-kratos/kratos/v2/transport"
)

func MyMiddleware() middleware.Middleware {
    return func(handler middleware.Handler) middleware.Handler {
        return func(ctx context.Context, req interface{}) (interface{}, error) {
            // === PRE-PROCESSING ===
            // Extract info, validate, modify request
            
            // === CALL HANDLER ===
            reply, err := handler(ctx, req)
            
            // === POST-PROCESSING ===
            // Modify response, handle errors, log
            
            return reply, err
        }
    }
}
```

### Registration

```go
import (
    "github.com/go-kratos/kratos/v2/middleware/recovery"
    "github.com/go-kratos/kratos/v2/middleware/validate"
)

srv := http.NewServer(
    http.Address(":8000"),
    http.Middleware(
        recovery.Recovery(),
        validate.Validator(),
        MyMiddleware(),
    ),
)
```

---

## Transport Extraction

### Get Request Info

```go
func MyMiddleware() middleware.Middleware {
    return func(handler middleware.Handler) middleware.Handler {
        return func(ctx context.Context, req interface{}) (interface{}, error) {
            if tr, ok := transport.FromServerContext(ctx); ok {
                // Generic transport info
                operation := tr.Operation()
                kind := tr.Kind()  // transport.KindHTTP or KindGRPC
                
                // HTTP-specific info
                if hr, ok := tr.(*http.Transport); ok {
                    method := hr.Request().Method
                    url := hr.Request().URL.String()
                    path := hr.Request().URL.Path
                    
                    // Headers
                    userAgent := hr.RequestHeader().Get("User-Agent")
                    auth := hr.RequestHeader().Get("Authorization")
                    contentType := hr.RequestHeader().Get("Content-Type")
                    
                    // Set response header
                    hr.ResponseHeader().Set("X-Response-Time", "100ms")
                }
            }
            
            return handler(ctx, req)
        }
    }
}
```

### Set Response Header in Service

```go
func (s *UserService) GetUser(ctx context.Context, req *v1.GetUserRequest) (*v1.GetUserResponse, error) {
    if httpCtx, ok := ctx.(http.Context); ok {
        httpCtx.Response().Header().Set("X-Custom", "value")
    }
    // Business logic...
}
```

---

## Log Filtering

Kratos provides log filtering for sensitive data:

### Filter by Level

```go
import "github.com/go-kratos/kratos/v2/log"

h := log.NewHelper(
    log.NewFilter(logger,
        log.FilterLevel(log.LevelError),  // Only log errors
    ),
)
```

### Filter by Key

```go
h := log.NewHelper(
    log.NewFilter(logger,
        log.FilterKey("password"),  // Hide password field
    ),
)

h.Info("password", "secret123")  // Output: password "***"
```

### Filter by Value

```go
h := log.NewHelper(
    log.NewFilter(logger,
        log.FilterValue("secret"),  // Hide exact value "secret"
    ),
)

h.Info("token", "secret")  // Output: token "***"
```

### Custom Filter Function

```go
h := log.NewHelper(
    log.NewFilter(logger,
        log.FilterFunc(func(level log.Level, keyvals ...interface{}) bool {
            // keyvals is alternating: key, value, key, value...
            for i := 0; i < len(keyvals); i += 2 {
                key := keyvals[i]
                value := keyvals[i+1]
                
                if key == "token" {
                    keyvals[i+1] = "***MASKED***"
                }
                if key == "password" {
                    keyvals[i+1] = "***"
                }
            }
            return false  // Return false to continue logging
        }),
    ),
)
```

---

## Recovery Middleware

Catch panics and return proper errors:

```go
import "github.com/go-kratos/kratos/v2/middleware/recovery"

srv := http.NewServer(
    http.Address(":8000"),
    http.Middleware(
        recovery.Recovery(),  // Always first in chain
    ),
)
```

With custom recovery handler:

```go
srv := http.NewServer(
    http.Middleware(
        recovery.Recovery(
            recovery.WithHandler(func(ctx context.Context, req, err interface{}) error {
                log.Errorf("panic recovered: %v", err)
                return errors.New(500, "INTERNAL_ERROR", "internal server error")
            }),
        ),
    ),
)
```

---

## Validate Middleware

Kratos provides two approaches for protovalidate integration:

### Approach 1: Middleware-level Validation

Use `validate.Validator()` middleware for automatic request validation:

```go
import (
    "buf.build/go/protovalidate"
    "github.com/go-kratos/kratos/v2/middleware/validate"
)

func provideValidator() (protovalidate.Validator, error) {
    v, err := protovalidate.New()
    if err != nil {
        return nil, err
    }
    return v, nil
}

srv := http.NewServer(
    http.Middleware(
        validate.Validator(provideValidator()),  // Validates all proto requests
    ),
)
```

### Approach 2: Service-level Validation

For selective validation or custom error handling, validate in service layer:

```go
type MyService struct {
    v1.UnimplementedMyServiceServer
    validator protovalidate.Validator
    uc        *biz.MyUseCase
    log       *log.Helper
}

func NewMyService(uc *biz.MyUseCase, logger log.Logger, validator protovalidate.Validator) *MyService {
    return &MyService{
        uc:        uc,
        validator: validator,
        log:       log.NewHelper(logger),
    }
}

func (s *MyService) GetUser(ctx context.Context, req *v1.GetUserRequest) (*v1.GetUserResponse, error) {
    // Validate request before business logic
    if err := s.validator.Validate(req); err != nil {
        return nil, v1.ErrorInvalidArgument("validation failed: %v", err)
    }
    return s.uc.GetUser(ctx, req.UserId)
}
```

**When to use each approach:**
- **Middleware-level**: All requests need validation, consistent error format
- **Service-level**: Selective validation, partial updates, custom error messages

**Note:** For partial updates (PATCH), you may need to skip validation on optional fields. Use service-level validation for this case.

---

## Middleware Chain Ordering

Recommended order for HTTP server:

```go
srv := http.NewServer(
    http.Middleware(
        // 1. Recovery - catch panics first
        recovery.Recovery(),
        
        // 2. Tracing - set trace context
        tracing.Server(),
        
        // 3. Logging - log requests
        logging.Server(logger),
        
        // 4. Authentication - verify identity
        jwt.Server(signingKey),
        
        // 5. Authorization - check permissions
        casbinM.Server(enforcer),
        
        // 6. Validate - check request format
        validate.Validator(),
        
        // 7. Rate limiting - prevent abuse
        ratelimit.Server(),
        
        // 8. Business middleware
        MyBusinessMiddleware(),
    ),
)
```

**Order rationale:**
- Recovery first: catch all panics
- Tracing/logging early: capture full request
- Auth before validate: don't validate unauthorized requests
- Validate before business: don't process invalid requests
- Rate limit last before business: allow legitimate requests through

---

## Logging Helper Pattern

```go
import "github.com/go-kratos/kratos/v2/log"

type MyUseCase struct {
    log *log.Helper
}

func NewMyUseCase(logger log.Logger) *MyUseCase {
    return &MyUseCase{
        log: log.NewHelper(
            log.With(logger, 
                "module", "biz/myUseCase",
                "service", "myService",
            ),
        ),
    }
}

func (uc *MyUseCase) DoSomething(ctx context.Context) {
    // Log with context (includes trace info)
    uc.log.WithContext(ctx).Infof("doing something")
    
    // Log error
    uc.log.WithContext(ctx).Errorf("error occurred: %v", err)
}
```

---

## Request/Response Logging

```go
func LoggingMiddleware(logger log.Logger) middleware.Middleware {
    h := log.NewHelper(logger)
    
    return func(handler middleware.Handler) middleware.Handler {
        return func(ctx context.Context, req interface{}) (interface{}, error) {
            // Log request
            if tr, ok := transport.FromServerContext(ctx); ok {
                h.WithContext(ctx).Infof(
                    "request: operation=%s kind=%s",
                    tr.Operation(),
                    tr.Kind(),
                )
            }
            
            // Call handler
            start := time.Now()
            reply, err := handler(ctx, req)
            duration := time.Since(start)
            
            // Log response
            h.WithContext(ctx).Infof(
                "response: duration=%dms error=%v",
                duration.Milliseconds(),
                err,
            )
            
            return reply, err
        }
    }
}
```

---

## Custom Operation for Non-Proto Routes

```go
func (s *UploadService) uploadFile(ctx http.Context) error {
    // Set operation for middleware to identify
    http.SetOperation(ctx, "/upload.v1.UploadService/Upload")
    
    // Now middleware can use tr.Operation() = "/upload.v1.UploadService/Upload"
    h := ctx.Middleware(func(ctx context.Context, req interface{}) (interface{}, error) {
        return s.uc.Upload(ctx, req.(*UploadRequest))
    })
    
    resp, err := h(ctx, &req)
    return ctx.JSON(200, resp)
}