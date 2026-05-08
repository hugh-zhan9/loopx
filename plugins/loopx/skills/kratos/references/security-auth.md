# Security & Auth

Guide for JWT, Casbin, idempotency, and data masking in Kratos.

## When to Use

- Extracting JWT claims from context
- Setting up Casbin authorization
- Implementing idempotency middleware
- Data masking for sensitive fields

---

## JWT Context Extraction

### Get Payload from Context

```go
import (
    "github.com/go-kratos/kratos/v2/middleware/auth/jwt"
    jwtV4 "github.com/golang-jwt/jwt/v4"
)

func getPayloadFromCtx(ctx context.Context, partName string) (string, error) {
    if claims, ok := jwt.FromContext(ctx); ok {
        if m, ok := claims.(jwtV4.MapClaims); ok {
            if v, ok := m[partName].(string); ok {
                return v, nil
            }
        }
    }
    return "", errors.New("invalid Jwt")
}

// Usage
func (s *UserService) GetUser(ctx context.Context, req *v1.GetUserRequest) (*v1.GetUserResponse, error) {
    userID, err := getPayloadFromCtx(ctx, "user_id")
    if err != nil {
        return nil, err
    }
    // Use userID in business logic
}
```

### JWT Middleware Setup

```go
import (
    "github.com/go-kratos/kratos/v2/middleware/auth/jwt"
    jwtV4 "github.com/golang-jwt/jwt/v4"
)

var signingKey = []byte("your-secret-key")

// jwt.Server requires a Keyfunc for token verification
srv := http.NewServer(
    http.Address(":8000"),
    http.Middleware(
        jwt.Server(
            func(token *jwtV4.Token) (interface{}, error) {
                // Verify signing method
                if _, ok := token.Method.(*jwtV4.SigningMethodHMAC); !ok {
                    return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
                }
                return signingKey, nil
            },
            jwt.WithSigningMethod(jwtV4.SigningMethodHS256),
        ),
    ),
)
```

**Why Keyfunc:** The `jwt.Server` middleware requires a function to retrieve the verification key. This allows for key rotation and multi-key scenarios. For simple cases, return the static key directly.

### JWT Best Practices

From industry standards:

1. **Always use HTTPS** - Prevents token interception
2. **Limit token refresh** - e.g., 50 times per day max
3. **Short token lifetime** - e.g., 15 minutes for access token
4. **Use httponly cookies** - Prevent JavaScript access
5. **SameSite=Strict** - Prevent CSRF

```go
// Cookie settings
http.SetCookie(ctx, &http.Cookie{
    Name:     "token",
    Value:    token,
    HttpOnly: true,
    SameSite: http.SameSiteStrictMode,
    Secure:   true,  // HTTPS only
    MaxAge:   900,   // 15 minutes
})
```

---

## Casbin Integration

### Model Configuration

Use `keyMatch3` for Kratos URL patterns:

```c
# model.conf
[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub, r.dom) && r.dom == p.dom && (regexMatch(r.obj, p.obj) || keyMatch3(r.obj, p.obj)) && r.act == p.act
```

**Why keyMatch3:** Kratos generates URLs like `/api/v1/user/{user_id}`. keyMatch3 matches `{variable}` patterns.

### Middleware Setup

```go
import (
    "github.com/casbin/casbin/v2"
    casbinM "github.com/go-kratos/kratos/v2/middleware/auth/casbin"
)

func NewCasbinEnforcer() *casbin.Enforcer {
    m := model.NewModelFromFile("model.conf")
    a := fileadapter.NewAdapter("policy.csv")
    e, _ := casbin.NewEnforcer(m, a)
    return e
}

srv := http.NewServer(
    http.Address(":8000"),
    http.Middleware(
        casbinM.Server(
            casbinM.WithEnforcer(NewCasbinEnforcer()),
            casbinM.WithModel(model),
        ),
    ),
)
```

### Get URL in Middleware

```go
func MyMiddleware() middleware.Middleware {
    return func(handler middleware.Handler) middleware.Handler {
        return func(ctx context.Context, req interface{}) (interface{}, error) {
            if tr, ok := transport.FromServerContext(ctx); ok {
                if hr, ok := tr.(*http.Transport); ok {
                    method := hr.Request().Method
                    path := hr.Request().RequestURI
                    
                    // Use for Casbin, logging, etc.
                }
            }
            return handler(ctx, req)
        }
    }
}
```

### Policy Watcher (Hot Refresh)

```go
import "github.com/casbin/casbin/v2/persist"

type Watcher struct {
    callback func(string)
    notify   chan struct{}
    done     chan struct{}  // For graceful shutdown
}

func (w *Watcher) SetUpdateCallback(fn func(string)) error {
    w.callback = fn
    go func() {
        for {
            select {
            case <-w.notify:
                fn("policy updated")
            case <-w.done:
                return  // Graceful shutdown
            }
        }
    }()
    return nil
}

func (w *Watcher) Close() {
    close(w.done)
}

func (w *Watcher) Update() error {
    w.notify <- struct{}{}
    return nil
}

// Use in biz layer to trigger refresh
func (uc *RoleUseCase) UpdatePolicy(roles []*Role) error {
    defer uc.watcher.Update()  // Notify Casbin to refresh
    // Update policy in database...
}
```

---

## Idempotency Middleware

Prevent duplicate operations on non-idempotent endpoints:

### Token-Based Idempotency

```go
func IdempotentMiddleware() middleware.Middleware {
    return func(handler middleware.Handler) middleware.Handler {
        return func(ctx context.Context, req interface{}) (interface{}, error) {
            tr, ok := transport.FromServerContext(ctx)
            if !ok {
                return nil, errors.New("no transport")
            }
            
            // Check whitelist (some operations don't need idempotency)
            if isWhitelisted(tr.Operation()) {
                return handler(ctx, req)
            }
            
            // Get idempotency token
            token := tr.RequestHeader().Get("x-idempotent")
            if token == "" {
                return nil, errors.New(400, "MISSING_TOKEN", "x-idempotent header required")
            }
            
            // Check if token was used
            if wasUsed(token) {
                return nil, errors.New(409, "TOKEN_USED", "duplicate request")
            }
            
            // Mark token as used
            markUsed(token)
            
            return handler(ctx, req)
        }
    }
}
```

### Client Usage

```bash
# First request
curl -X POST -H "x-idempotent: abc123" https://api.example.com/v1/orders

# Retry with same token (fails with 409)
curl -X POST -H "x-idempotent: abc123" https://api.example.com/v1/orders

# New request with new token
curl -X POST -H "x-idempotent: xyz789" https://api.example.com/v1/orders
```

---

## Data Masking

Hide sensitive data in responses and logs:

### Struct Tag Approach

```go
type User struct {
    Name     string `json:"name"`
    Mobile   string `json:"mobile" mask:"mobile"`      // 138****5678
    Email    string `json:"email" mask:"email"`        // abc***@example.com
    IDCard   string `json:"id_card" mask:"idcard"`     // 310***1234
    BankCard string `json:"bank_card" mask:"bankcard"` // 6222 **** 0123
}
```

### Masking Functions

```go
var defaultRules = map[string]MaskRule{
    "mobile": {
        Pattern:     regexp.MustCompile(`^(\d{3})\d{4}(\d{4})$`),
        Replacement: "$1****$2",
    },
    "email": {
        Pattern:     regexp.MustCompile(`^(.{3}).*(@.*)$`),
        Replacement: "$1***$2",
    },
    "idcard": {
        Pattern:     regexp.MustCompile(`^(.{6}).*(.{4})$`),
        Replacement: "$1********$2",
    },
    "bankcard": {
        Pattern:     regexp.MustCompile(`^(\d{4})\d+(\d{4})$`),
        Replacement: "$1 **** **** $2",
    },
    "name": {
        Handler: func(s string) string {
            if len(s) <= 1 {
                return s
            }
            return s[:1] + strings.Repeat("*", len(s)-1)
        },
    },
}
```

### Masker Implementation

```go
type Masker interface {
    Mask(interface{}) interface{}
}

func (m *DefaultMasker) Mask(data interface{}) interface{} {
    value := reflect.ValueOf(data)
    
    if value.Kind() == reflect.Struct {
        result := reflect.New(value.Type()).Elem()
        for i := 0; i < value.NumField(); i++ {
            field := value.Field(i)
            maskTag := value.Type().Field(i).Tag.Get("mask")
            
            if maskTag != "" && field.Kind() == reflect.String {
                if rule, ok := m.rules[maskTag]; ok {
                    masked := m.applyRule(rule, field.String())
                    result.Field(i).SetString(masked)
                }
            } else {
                result.Field(i).Set(field)
            }
        }
        return result.Interface()
    }
    return data
}
```

---

## Log Filtering

Filter sensitive data from logs:

```go
import "github.com/go-kratos/kratos/v2/log"

h := log.NewHelper(
    log.NewFilter(logger,
        // Filter by level
        log.FilterLevel(log.LevelError),
        
        // Filter by key
        log.FilterKey("password"),
        
        // Filter by value
        log.FilterValue("secret"),
        
        // Custom filter
        log.FilterFunc(func(level log.Level, keyvals ...interface{}) bool {
            for i := 0; i < len(keyvals); i += 2 {
                if keyvals[i] == "token" {
                    keyvals[i+1] = "***MASKED***"
                }
            }
            return false  // Return false to continue logging
        }),
    ),
)
```

---

## Header/Context Extraction

Get request information in middleware or service:

```go
import (
    "github.com/go-kratos/kratos/v2/transport"
    "github.com/go-kratos/kratos/v2/transport/http"
)

func extractInfo(ctx context.Context) {
    // Get transport
    if tr, ok := transport.FromServerContext(ctx); ok {
        operation := tr.Operation()
        
        // Get HTTP-specific info
        if hr, ok := tr.(*http.Transport); ok {
            method := hr.Request().Method
            path := hr.Request().URL.Path
            userAgent := hr.RequestHeader().Get("User-Agent")
            authorization := hr.RequestHeader().Get("Authorization")
        }
    }
    
    // Set response header
    if httpCtx, ok := ctx.(http.Context); ok {
        httpCtx.Response().Header().Set("X-Custom", "value")
    }
}