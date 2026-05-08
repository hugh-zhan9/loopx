# Architecture

Guide for Kratos layered architecture and dependency injection.

## When to Use

- Structuring a new Kratos project
- Understanding layer responsibilities
- Setting up fx dependency injection
- Defining repository interfaces

---

## Layer Responsibilities

Kratos follows clean architecture with three primary layers:

```
┌─────────────────────────────────────────────┐
│                  Service                     │
│  (Protocol conversion, simple validation)    │
├─────────────────────────────────────────────┤
│                    Biz                       │
│  (Business logic, domain models, use cases)  │
├─────────────────────────────────────────────┤
│                   Data                       │
│  (Data access, repositories, external APIs)  │
└─────────────────────────────────────────────┘
```

### Service Layer

**Responsibility:** Protocol conversion and basic validation.

- Convert HTTP/gRPC requests to internal types
- Call biz layer with appropriate parameters
- Convert biz responses back to proto types
- Handle proto-level validation (protovalidate)

**Does NOT contain:** Business logic, data access, complex calculations

```go
// Service layer - protocol conversion only
func (s *UserService) GetUser(ctx context.Context, req *v1.GetUserRequest) (*v1.GetUserResponse, error) {
    // 1. Validate request (proto-level)
    if err := s.validator.Validate(req); err != nil {
        return nil, err
    }
    
    // 2. Call biz layer
    user, err := s.uc.GetUser(ctx, req.UserId)
    if err != nil {
        return nil, err
    }
    
    // 3. Convert to proto response
    return &v1.GetUserResponse{
        Name: user.Name,
        Email: user.Email,
    }, nil
}
```

### Biz Layer

**Responsibility:** Business logic and domain rules.

- Implement business rules and workflows
- Define domain entities (not proto types)
- Coordinate between repositories
- Handle business-level errors

**Does NOT contain:** HTTP/gRPC details, database queries, proto types

```go
// Biz layer - business logic only
type User struct {
    ID    int64
    Name  string
    Email string
}

type UserUseCase struct {
    repo UserRepo
    log  *log.Helper
}

func (uc *UserUseCase) GetUser(ctx context.Context, id string) (*User, error) {
    uc.log.WithContext(ctx).Infof("Getting user: %s", id)
    
    // Business logic: check permissions, apply rules
    user, err := uc.repo.FindByID(ctx, id)
    if err != nil {
        return nil, v1.ErrorUserNotFound("user %s not found", id)
    }
    
    // Business rule: inactive users not accessible
    if user.Status == "inactive" {
        return nil, errors.New(403, "FORBIDDEN", "user is inactive")
    }
    
    return user, nil
}
```

### Data Layer

**Responsibility:** Data access and external service integration.

- Implement repository interfaces
- Database operations (SQL, NoSQL)
- External API calls
- Cache management

**Does NOT contain:** Business logic, protocol handling

```go
// Data layer - data access only
type userRepo struct {
    db  *gorm.DB
    log *log.Helper
}

func (r *userRepo) FindByID(ctx context.Context, id string) (*biz.User, error) {
    var model UserModel
    if err := r.db.WithContext(ctx).Where("id = ?", id).First(&model).Error; err != nil {
        return nil, err
    }
    return &biz.User{
        ID:    model.ID,
        Name:  model.Name,
        Email: model.Email,
    }, nil
}
```

---

## Dependency Injection

Kratos supports two DI approaches: **wire** (official Kratos layout) and **fx** (alternative).

### Wire (Official Kratos Layout)

Wire is Google's compile-time dependency injection tool, used in official Kratos project templates.

**Install:**
```bash
go install github.com/google/wire/cmd/wire@latest
```

**Wire.go definition:**
```go
// go build will ignore this file, but wire uses it

//+build wireinject

package main

import (
    "github.com/google/wire"
    "github.com/go-kratos/kratos/v2"
    "github.com/go-kratos/kratos/v2/log"
    "github.com/myorg/myproject/internal/biz"
    "github.com/myorg/myproject/internal/data"
    "github.com/myorg/myproject/internal/server"
    "github.com/myorg/myproject/internal/service"
)

func wireApp(*conf.Server, *conf.Data, log.Logger) (*kratos.App, func(), error) {
    panic(wire.Build(
        data.ProviderSet,
        biz.ProviderSet,
        service.ProviderSet,
        server.ProviderSet,
        newApp,
    ))
}
```

**ProviderSet in each layer:**
```go
// internal/data/data.go
var ProviderSet = wire.NewSet(NewData, NewUserRepo)

// internal/biz/biz.go
var ProviderSet = wire.NewSet(NewUserUseCase)

// internal/service/service.go
var ProviderSet = wire.NewSet(NewUserService)

// internal/server/server.go
var ProviderSet = wire.NewSet(NewHTTPServer, NewGRPCServer)
```

**Generate wire_gen.go:**
```bash
wire ./cmd/server
```

**Advantages:**
- Compile-time verification (errors caught before runtime)
- No runtime reflection overhead
- Clear dependency graph visible in generated code
- Official Kratos template uses this approach

---

### fx (Alternative - Uber's DI)

fx is Uber's runtime dependency injection framework.

## fx Dependency Injection

Kratos also supports Uber fx for dependency injection:

### Module Pattern

Organize dependencies into modules:

```go
// internal/service/fx.go
package service

import "go.uber.org/fx"

var Module = fx.Options(
    fx.Provide(NewUserService),
    fx.Provide(NewOrderService),
)

// internal/biz/fx.go
package biz

var Module = fx.Options(
    fx.Provide(NewUserUseCase),
    fx.Provide(NewOrderUseCase),
)

// internal/data/fx.go
package data

var Module = fx.Options(
    fx.Provide(NewUserRepo),
    fx.Provide(NewData),  // DB connection
)

// internal/server/fx.go
package server

var Module = fx.Options(
    fx.Provide(NewHTTPServer),
    fx.Provide(NewGRPCServer),
)
```

### Main Application

```go
// cmd/server/main.go
package main

import (
    "github.com/myorg/myproject/internal/biz"
    "github.com/myorg/myproject/internal/data"
    "github.com/myorg/myproject/internal/server"
    "github.com/myorg/myproject/internal/service"
    "go.uber.org/fx"
)

func main() {
    app := fx.New(
        // Provide configs
        fx.Provide(provideConfigs),
        fx.Provide(provideLogger),
        fx.Provide(provideValidator),
        
        // Include modules
        server.Module,
        data.Module,
        biz.Module,
        service.Module,
        
        // Provide Kratos app
        appModule,
    )
    app.Run()
}
```

### Dependency Flow

```
fx.New() resolves dependencies:
    
    provideConfigs → Bootstrap
    provideLogger → log.Logger
    provideValidator → protovalidate.Validator
    
    data.Module:
        NewData(Bootstrap) → *gorm.DB
        NewUserRepo(*gorm.DB, log.Logger) → biz.UserRepo
    
    biz.Module:
        NewUserUseCase(biz.UserRepo, log.Logger) → *UserUseCase
    
    service.Module:
        NewUserService(*UserUseCase, log.Logger, protovalidate.Validator) → *UserService
    
    server.Module:
        NewHTTPServer(Bootstrap, *UserService, log.Logger) → *http.Server
```

---

## Repository Interface Pattern

Define repository interfaces in biz layer, implement in data layer:

### Interface Definition (Biz)

```go
// internal/biz/user.go
package biz

import "context"

// UserRepo interface - defined in biz, implemented in data
type UserRepo interface {
    Save(ctx context.Context, user *User) (*User, error)
    FindByID(ctx context.Context, id int64) (*User, error)
    FindByEmail(ctx context.Context, email string) (*User, error)
    Update(ctx context.Context, user *User) (*User, error)
    Delete(ctx context.Context, id int64) error
    ListAll(ctx context.Context) ([]*User, error)
}
```

### Implementation (Data)

```go
// internal/data/user.go
package data

import (
    "context"
    "github.com/myorg/myproject/internal/biz"
    "github.com/go-kratos/kratos/v2/log"
)

type userRepo struct {
    data *Data
    log  *log.Helper
}

// NewUserRepo implements biz.UserRepo interface
func NewUserRepo(data *Data, logger log.Logger) biz.UserRepo {
    return &userRepo{
        data: data,
        log:  log.NewHelper(logger),
    }
}

func (r *userRepo) Save(ctx context.Context, user *biz.User) (*biz.User, error) {
    // Database implementation
    return user, nil
}
```

**Why this matters:** Biz layer doesn't know about database details. You can swap databases without changing business logic.

---

## Custom Route Middleware Inheritance

For non-proto routes (file upload, WebSocket), inherit server middleware:

```go
// internal/server/http.go
func NewHTTPServer(c *conf.Server, greeter *service.GreeterService, logger log.Logger) *http.Server {
    opts := []http.ServerOption{
        http.Middleware(
            recovery.Recovery(),
            auth.AuthToken(),
        ),
    }
    
    srv := http.NewServer(opts...)
    
    // Proto-generated routes (automatic middleware)
    v1.RegisterGreeterServiceHTTPServer(srv, greeter)
    
    // Custom route (manual middleware)
    route := srv.Route("/")
    route.POST("/v1/upload", greeter.UploadFile)
    
    return srv
}

// service/upload.go
func (s *GreeterService) UploadFile(ctx http.Context) error {
    // Set operation for middleware
    http.SetOperation(ctx, "/upload.v1.UploadService/Upload")
    
    // Bind request
    var req UploadRequest
    if err := ctx.BindQuery(&req); err != nil {
        return err
    }
    
    // Use middleware chain
    h := ctx.Middleware(func(ctx context.Context, req interface{}) (interface{}, error) {
        return s.uc.UploadFile(ctx, req.(*UploadRequest))
    })
    
    resp, err := h(ctx, &req)
    if err != nil {
        return err
    }
    
    return ctx.JSON(200, resp)
}
```

---

## pb → Struct Type Conversion

Use copier with copieroptpb for protobuf to Go struct conversion:

### Install

```bash
go get github.com/jinzhu/copier
go get github.com/tiny-lib/copieroptpb
```

### Usage

```go
import (
    "github.com/jinzhu/copier"
    "github.com/tiny-lib/copieroptpb"
)

// biz layer struct
type User struct {
    Name  string
    Email string
}

// Convert pb message to biz struct
func toBizUser(pbUser *v1.User) (*User, error) {
    user := &User{}
    if err := copier.CopyWithOption(pbUser, user, copieroptpb.Option()); err != nil {
        return nil, err
    }
    return user, nil
}

// Convert biz struct to pb message
func toProtoUser(user *User) (*v1.User, error) {
    pbUser := &v1.User{}
    if err := copier.CopyWithOption(user, pbUser, copieroptpb.Option()); err != nil {
        return nil, err
    }
    return pbUser, nil
}
```

**Why copieroptpb:** Handles protobuf wrapper types (StringValue, Int32Value, etc.) that copier doesn't understand natively.

---

## Dependency Boundaries

Keep layers isolated:

| Layer | Allowed Dependencies |
|-------|---------------------|
| Service | Biz, proto types, kratos transport |
| Biz | Data (interfaces), domain types, errors |
| Data | Biz (interfaces), database drivers, external APIs |

**Forbidden:**
- Service → Data (skip biz layer)
- Data → Service (reverse dependency)
- Any layer → proto types in wrong context