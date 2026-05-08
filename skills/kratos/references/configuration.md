# Configuration

Guide for Kratos configuration management and startup hooks.

## When to Use

- Setting up Bootstrap configuration
- Validating config before startup
- Adding startup/shutdown hooks
- Extending config format support

---

## Bootstrap Configuration Pattern

Use protobuf to define configuration with validation:

### Proto Definition

```protobuf
// internal/conf/conf.proto
syntax = "proto3";
package conf;

import "buf/validate/validate.proto";
import "google/protobuf/duration.proto";

option go_package = "github.com/myorg/myproject/internal/conf;conf";

message Bootstrap {
    Server server = 1;
    Data data = 2;
    Log log = 3;
}

message Server {
    message HTTP {
        string network = 1;
        string addr = 2;
        google.protobuf.Duration timeout = 3 [
            (buf.validate.field).required = true,
            (buf.validate.field).duration = {
                gt: {seconds: 1}
                lte: {seconds: 600}
            }
        ];
    }
    message GRPC {
        string network = 1;
        string addr = 2;
        google.protobuf.Duration timeout = 3 [
            (buf.validate.field).required = true,
            (buf.validate.field).duration = {
                gt: {seconds: 1}
                lte: {seconds: 600}
            }
        ];
    }
    HTTP http = 1;
    GRPC grpc = 2;
}

message Data {
    message Database {
        string driver = 1;
        string source = 2;
    }
    message Redis {
        string network = 1;
        string addr = 2;
        google.protobuf.Duration read_timeout = 3;
        google.protobuf.Duration write_timeout = 4;
    }
    Database database = 1;
    Redis redis = 2;
}

enum LogLevel {
    Debug = 0;
    Info = 1;
    Warn = 2;
    Error = 3;
    Fatal = 4;
}

message Log {
    string log_path = 1;
    LogLevel log_level = 2 [
        (buf.validate.field).enum = {
            defined_only: true
            in: [0, 1, 2, 3, 4]
        }
    ];
    int32 max_size = 3;
    int32 max_keep_days = 4;
    int32 max_keep_files = 5;
    bool compress = 6;
}
```

### YAML Config File

```yaml
# configs/config.yaml
server:
  http:
    addr: 0.0.0.0:8000
    timeout: 10s
  grpc:
    addr: 0.0.0.0:9000
    timeout: 10s

data:
  database:
    driver: mysql
    source: user:pass@tcp(localhost:3306)/db?charset=utf8mb4
  redis:
    addr: localhost:6379
    read_timeout: 0.5s
    write_timeout: 0.5s

log:
  log_path: /var/log/app.log
  log_level: Info
  max_size: 100
  max_keep_days: 7
  max_keep_files: 10
  compress: true
```

---

## Startup Validation

Validate configuration before application starts:

```go
// cmd/server/main.go
package main

import (
    "buf.build/go/protovalidate"
    "github.com/go-kratos/kratos/v2/config"
    "github.com/go-kratos/kratos/v2/config/file"
)

func provideConfigs(flagConf string) *conf.Bootstrap {
    c := config.New(
        config.WithSource(file.NewSource(flagConf)),
    )
    
    var bc conf.Bootstrap
    if err := c.Scan(&bc); err != nil {
        panic(err)  // Startup failure - program cannot run without config
    }
    
    // Create validator
    validator, err := protovalidate.New()
    if err != nil {
        panic(err)  // Startup failure - validator is required
    }
    
    // Validate config before boot
    if err := validator.Validate(&bc); err != nil {
        panic(err)  // Startup failure - invalid config is fatal
    }
    
    return &bc
}
```

**Why panic is acceptable here:** This is startup code. If config is invalid, the application cannot run. Panics at startup are appropriate because there's no graceful recovery possible. For library/utility functions, prefer returning errors instead.
```

**Why this matters:** Invalid config is caught at startup, not during operation. Proto-based validation keeps rules with data definition.

---

## Multi-Format Config Extension

Kratos supports json, yaml, proto, xml by default. Add other formats:

### TOML Example

```go
// internal/pkg/tomlencoding/toml.go
package tomlencoding

import (
    "github.com/BurntSushi/toml"
    "github.com/go-kratos/kratos/v2/encoding"
)

const Name = "toml"

func init() {
    encoding.RegisterCodec(codec{})
}

type codec struct{}

func (codec) Marshal(v interface{}) ([]byte, error) {
    return toml.Marshal(v)
}

func (codec) Unmarshal(data []byte, v interface{}) error {
    return toml.Unmarshal(data, v)
}

func (codec) Name() string {
    return Name
}
```

### Usage

```go
// cmd/server/main.go
import _ "github.com/myorg/myproject/internal/pkg/tomlencoding"

// Now .toml files are supported
c := config.New(
    config.WithSource(file.NewSource("configs")),
)
```

### Resolver for Key Normalization

Different formats use different key conventions (camelCase vs snake_case):

```go
func resolver(input map[string]interface{}) error {
    // Normalize keys: MyTitle → my_title
    for key, value := range input {
        normalizedKey := toSnakeCase(key)
        if normalizedKey != key {
            input[normalizedKey] = value
            delete(input, key)
        }
    }
    return nil
}

c := config.New(
    config.WithSource(file.NewSource("configs")),
    config.WithResolver(resolver),
)
```

---

## Startup Hooks

Kratos v2.5.3+ provides lifecycle hooks:

### Hook Types

```go
// BeforeStart: Runs before server starts
// BeforeStop: Runs before server stops
// AfterStart: Runs after server starts
// AfterStop: Runs after server stops

app := kratos.New(
    kratos.Name("my-app"),
    kratos.Version("v1.0.0"),
    
    kratos.BeforeStart(func(ctx context.Context) error {
        log.Info("Initializing...")
        // Initialize caches, warm up data
        return nil
    }),
    
    kratos.AfterStart(func(ctx context.Context) error {
        log.Info("Server started")
        // Register with external systems
        return nil
    }),
    
    kratos.BeforeStop(func(ctx context.Context) error {
        log.Info("Shutting down...")
        // Drain connections, save state
        return nil
    }),
    
    kratos.AfterStop(func(ctx context.Context) error {
        log.Info("Server stopped")
        // Cleanup
        return nil
    }),
)
```

### Use Cases

| Hook | Common Uses |
|------|-------------|
| BeforeStart | Database warmup, cache pre-fill, config validation |
| AfterStart | Health check registration, service discovery |
| BeforeStop | Connection drain, state persistence |
| AfterStop | Cleanup, metrics export |

---

## Task Dependency Handling

For initialization tasks with dependencies:

### Processor Interface

```go
type processor interface {
    // IsInit: Check if initialization needed
    IsInit() bool
    
    // Apply: Execute initialization
    Apply(seeds []interface{}) error
    
    // LoadSeeds: Get initialization data
    LoadSeeds() ([]interface{}, error)
    
    // GetJobID: Task sequence number
    GetJobID() int
    
    // GetDepends: Dependencies (job IDs)
    GetDepends() []int
}
```

### Example: Database Initialization

```go
type DatabaseInit struct {
    jobID    int
    depends  []int
}

func (d *DatabaseInit) GetJobID() int { return d.jobID }
func (d *DatabaseInit) GetDepends() []int { return d.depends }
func (d *DatabaseInit) IsInit() bool {
    // Check if tables exist
    return !d.tablesExist()
}
func (d *DatabaseInit) LoadSeeds() ([]interface{}, error) {
    // Load seed data from files
    return d.loadSeedData(), nil
}
func (d *DatabaseInit) Apply(seeds []interface{}) error {
    // Create tables and insert seeds
    return d.createTablesAndInsert(seeds)
}
```

### Task Ordering

Sort processors by dependencies:

```go
func runInitialization(processors []processor) error {
    // Sort by dependencies (topological order)
    sort.Slice(processors, func(i, j int) bool {
        return processors[i].GetJobID() < processors[j].GetJobID()
    })
    
    for _, p := range processors {
        if p.IsInit() {
            seeds, err := p.LoadSeeds()
            if err != nil {
                return err
            }
            if err := p.Apply(seeds); err != nil {
                return err
            }
        }
    }
    return nil
}
```

---

## Environment Variable Integration

Combine file config with environment overrides:

```go
c := config.New(
    config.WithSource(
        file.NewSource("configs"),
        // Add env source
        env.NewSource("APP_"),  // APP_SERVER_HTTP_ADDR → server.http.addr
    ),
)
```

Environment variables override file values:
```bash
APP_SERVER_HTTP_ADDR=0.0.0.0:9000  # Overrides config.yaml
```