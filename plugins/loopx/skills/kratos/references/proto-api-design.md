# Proto API Design

Guide for defining HTTP APIs with protobuf in Kratos.

## When to Use

- Creating new service APIs
- Defining HTTP routes with path variables
- Setting up field validation
- Configuring buf generation

---

## HTTP Proto Definition Patterns

### Basic Path Variables

```protobuf
// Simple variable extraction
message GetUserRequest {
    string user_id = 1;  // Extracted from URL
}

service UserService {
    rpc GetUser(GetUserRequest) returns (User) {
        option (google.api.http) = {
            get: "/v1/users/{user_id}"
        };
    }
}
// URL: GET /v1/users/123 → user_id = "123"
```

### Pattern Matching

Use patterns to restrict URL format and extract structured data:

```protobuf
// Single segment match (*)
message ListUsersRequest {
    string parent = 1;  // Value will be "projects/123"
}

service UserService {
    rpc ListUsers(ListUsersRequest) returns (ListUsersResponse) {
        option (google.api.http) = {
            get: "/v1/{parent=projects/*}/users"
        };
    }
}
// URL: GET /v1/projects/123/users → parent = "projects/123"

// Multi-segment match (**)
message GetResourceRequest {
    string path = 1;  // Value will be "a/b/c/d"
}

service ResourceService {
    rpc GetResource(GetResourceRequest) returns (Resource) {
        option (google.api.http) = {
            get: "/v1/{path=**}"
        };
    }
}
// URL: GET /v1/a/b/c/d → path = "a/b/c/d"
```

### HTTP Method Mapping

```protobuf
// GET - query parameters from URL
rpc GetUser(GetUserRequest) returns (User) {
    option (google.api.http) = {
        get: "/v1/users/{user_id}"
    };
}

// POST - body contains resource
rpc CreateUser(CreateUserRequest) returns (User) {
    option (google.api.http) = {
        post: "/v1/users"
        body: "user"  // Map 'user' field to request body
    };
}

// PUT - full resource replacement
rpc UpdateUser(UpdateUserRequest) returns (User) {
    option (google.api.http) = {
        put: "/v1/users/{user_id}"
        body: "user"
    };
}

// PATCH - partial update
rpc PatchUser(PatchUserRequest) returns (User) {
    option (google.api.http) = {
        patch: "/v1/users/{user_id}"
        body: "user"
    };
}

// DELETE - no body
rpc DeleteUser(DeleteUserRequest) returns (google.protobuf.Empty) {
    option (google.api.http) = {
        delete: "/v1/users/{user_id}"
    };
}
```

### Custom Methods

Use `:` suffix for custom operations beyond CRUD:

```protobuf
// Custom action on a resource
rpc ActivateUser(ActivateUserRequest) returns (User) {
    option (google.api.http) = {
        post: "/v1/users/{name}:activate"
        body: "*"
    };
}
// URL: POST /v1/users/123:activate

// Batch operations
rpc BatchCreateUsers(BatchCreateUsersRequest) returns (BatchCreateUsersResponse) {
    option (google.api.http) = {
        post: "/v1/users:batchCreate"
        body: "requests"
    };
}
// URL: POST /v1/users:batchCreate
```

### Multiple Routes (additional_bindings)

One RPC can serve multiple URL patterns:

```protobuf
rpc GetResource(GetResourceRequest) returns (Resource) {
    option (google.api.http) = {
        get: "/v1/{name=projects/*/resources/*}"
        additional_bindings {
            get: "/v1/{name=locations/*/resources/*}"
        }
    };
}
// URL: GET /v1/projects/123/resources/456
// URL: GET /v1/locations/us-east1/resources/456
```

### Pagination Pattern

Standard pagination fields:

```protobuf
message ListBooksRequest {
    string parent = 1;       // "shelves/shelf1"
    int32 page_size = 2;     // Max results per page
    string page_token = 3;   // Token from previous response
    string order_by = 4;     // Optional: "name desc"
    string filter = 5;       // Optional: "age>18"
}

message ListBooksResponse {
    repeated Book books = 1;
    string next_page_token = 2;  // Empty = no more data
    int32 total_size = 3;        // Optional: total count
}

service BookService {
    rpc ListBooks(ListBooksRequest) returns (ListBooksResponse) {
        option (google.api.http) = {
            get: "/v1/{parent=shelves/*}/books"
        };
    }
}
```

---

## buf.validate Field Validation

Use buf's protovalidate for runtime validation:

### String Validation

```protobuf
message User {
    string name = 1 [
        (buf.validate.field).string.min_len = 1,
        (buf.validate.field).string.max_len = 100,
        (buf.validate.field).string.pattern = "^[a-zA-Z]+$"
    ];
    
    string email = 2 [
        (buf.validate.field).string.email = true
    ];
    
    string website = 3 [
        (buf.validate.field).string.uri = true
    ];
}
```

### Integer Validation

```protobuf
message Product {
    int32 quantity = 1 [
        (buf.validate.field).int32.gte = 0,
        (buf.validate.field).int32.lte = 1000
    ];
    
    int32 status = 2 [
        (buf.validate.field).int32.in = [0, 1, 2, 3]
    ];
}
```

### Duration Validation

```protobuf
import "google/protobuf/duration.proto";

message Server {
    google.protobuf.Duration timeout = 1 [
        (buf.validate.field).required = true,
        (buf.validate.field).duration = {
            gt: {seconds: 1}      // Greater than 1 second
            lte: {seconds: 600}   // Less than or equal 10 minutes
        }
    ];
}
```

### Enum Validation

```protobuf
enum Status {
    UNKNOWN = 0;
    ACTIVE = 1;
    INACTIVE = 2;
}

message User {
    Status status = 1 [
        (buf.validate.field).enum.defined_only = true,
        (buf.validate.field).enum.in = [1, 2]
    ];
}
```

### Required Fields

```protobuf
message Request {
    string name = 1 [(buf.validate.field).required = true];
}
```

---

## buf.gen.yaml Configuration

Example configuration for Kratos projects:

```yaml
version: v1
managed:
  enabled: true
  override:
    - file_option: go_package
      module: buf.build/bufbuild/protovalidate
      value: buf.build/go/protovalidate

plugins:
  # Go struct generation
  - remote: buf.build/protocolbuffers/go
    out: api
    opt: paths=source_relative

  # gRPC service generation
  - remote: buf.build/grpc/go
    out: api
    opt:
      - paths=source_relative
      - require_unimplemented_servers=false

  # Validation code generation
  - remote: buf.build/bufbuild/validate-go
    out: api
    opt: paths=source_relative

  # OpenAPI documentation
  - remote: buf.build/community/google-gnostic-openapi
    out: docs
    opt:
      - paths=source_relative
      - naming=proto

  # Kratos HTTP gateway (local plugin)
  - local: protoc-gen-go-http
    out: api
    opt: paths=source_relative

  # Kratos error codes (local plugin)
  - local: protoc-gen-go-errors
    out: api
    opt: paths=source_relative
```

**Install local plugins:**
```bash
kratos upgrade  # Installs protoc-gen-go-http, protoc-gen-go-errors
```

---

## Critical Pitfall: Route Override Order

**Problem:** Route definitions are processed in order. A generic route can shadow a specific one.

```protobuf
// WRONG ORDER - specific route shadowed
rpc GetUser(GetUserRequest) returns (User) {
    option (google.api.http) = {get: "/v1/user/{user_id}"};  // Generic
}
rpc GetProfile(GetProfileRequest) returns (Profile) {
    option (google.api.http) = {get: "/v1/user/profile"};    // Specific - shadowed!
}

// CORRECT ORDER - specific route first
rpc GetProfile(GetProfileRequest) returns (Profile) {
    option (google.api.http) = {get: "/v1/user/profile"};    // Specific first
}
rpc GetUser(GetUserRequest) returns (User) {
    option (google.api.http) = {get: "/v1/user/{user_id}"};  // Generic last
}
```

**Why this matters:** HTTP routers match in order. `{user_id}` can match "profile", causing unexpected behavior.

---

## Error Code Design

Follow industry standards for error codes:

### Alibaba Format (5-digit string)

```
[A/B/C][NNNN]

A = User error (bad request)
B = System error (business logic)
C = Third-party error (external service)

NNNN = Error number within category
```

Examples:
- `A0001` - Invalid parameter (user error)
- `B0101` - Database connection failed (system error)
- `C0201` - Payment gateway timeout (third-party error)

### Proto Definition

```protobuf
enum ErrorReason {
    USER_NOT_FOUND = 0;
    INVALID_PARAMETER = 1;
    INTERNAL_ERROR = 2;
}

// In service code:
var ErrUserNotFound = errors.NotFound(
    ErrorReason_USER_NOT_FOUND.String(),
    "user not found"
)
```

### HTTP Error Response

```json
{
    "code": "A0001",
    "message": "Invalid parameter: user_id must be positive",
    "details": "See documentation at https://api.example.com/docs/errors/A0001"
}
```

---

## OpenAPI Documentation

buf.gen.yaml generates OpenAPI specs automatically:

```yaml
- remote: buf.build/community/google-gnostic-openapi
  out: docs
  opt:
    - paths=source_relative
    - naming=proto
```

Add proto-level documentation:

```protobuf
import "gnostic/openapi/v3/annotations.proto";

option (gnostic.openapi.v3.document) = {
  info: {
    title: "My API"
    version: "1.0.0"
    description: "API description"
  }
  servers: [
    {url: "https://api.example.com", description: "Production"}
  ]
};

service MyService {
  rpc GetUser(GetUserRequest) returns (User) {
    option (google.api.http) = {get: "/v1/users/{user_id}"};
    option (gnostic.openapi.v3.operation) = {
      operation_id: "getUser"
      summary: "Get a user by ID"
      description: "Returns the user with the specified ID"
    };
  }
}
```