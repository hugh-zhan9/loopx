# Advanced Features

Guide for MCP server integration and other advanced Kratos features.

## When to Use

- Integrating Kratos with AI agents via MCP
- Building tool-enabled microservices

---

## MCP Server Integration

Kratos can be combined with MCP (Model Context Protocol) to expose microservice functionality as AI agent tools.

### What is MCP?

MCP is a protocol for AI agents to discover and call tools. By integrating MCP with Kratos services, you can:

- Expose Kratos APIs as MCP tools for AI agents
- Enable tool discovery and schema validation
- Handle structured input/output for AI workflows

### Library Options

Two main Go MCP libraries exist:

| Library | Maintainer | Use Case |
|---------|------------|----------|
| `github.com/mark3labs/mcp-go` | Mark3 Labs | Community implementation |
| `github.com/modelcontextprotocol/go-sdk` | Anthropic | Official SDK |

**Note:** No official Kratos MCP transport exists yet. Integration requires custom setup.

### Integration Approach: MCP Handler in Kratos HTTP Server

Add MCP endpoint to existing Kratos HTTP server:

```go
import (
    "context"
    "fmt"
    "github.com/go-kratos/kratos/v2"
    "github.com/go-kratos/kratos/v2/log"
    "github.com/go-kratos/kratos/v2/transport/http"
    mcp "github.com/mark3labs/mcp-go/mcp"
    "github.com/mark3labs/mcp-go/server"
)

func main() {
    // Create MCP server
    mcpSrv := server.NewMCPServer("kratos-mcp", "v1.0.0")
    
    // Define tool
    tool := mcp.NewTool("hello_world",
        mcp.WithDescription("Say hello to someone"),
        mcp.WithString("name",
            mcp.Required(),
            mcp.Description("Name of the person to greet"),
        ),
    )
    
    // Add tool handler
    mcpSrv.AddTool(tool, helloHandler)
    
    // Create Kratos HTTP server with MCP endpoint
    httpSrv := http.NewServer(http.Address(":8000"))
    
    // Register MCP handler on Kratos HTTP server
    // MCP typically uses SSE (Server-Sent Events) transport
    route := httpSrv.Route("/")
    route.GET("/mcp", func(ctx http.Context) error {
        // Handle MCP SSE requests
        return handleMCPRequest(ctx, mcpSrv)
    })
    
    // Create Kratos app
    app := kratos.New(
        kratos.Name("kratos-mcp"),
        kratos.Server(httpSrv),
    )
    
    if err := app.Run(); err != nil {
        panic(err)
    }
}
```

### Tool Handler

```go
func helloHandler(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
    // Extract arguments
    name, ok := request.Params.Arguments["name"].(string)
    if !ok {
        return nil, errors.New("name must be a string")
    }
    
    // Return result
    return mcp.NewToolResultText(fmt.Sprintf("Hello, %s!", name)), nil
}
```

### Multiple Tools

```go
func registerMCPTools(mcpSrv *server.MCPServer, userUC *biz.UserUseCase, orderUC *biz.OrderUseCase) {
    // Tool 1: User lookup
    userTool := mcp.NewTool("get_user",
        mcp.WithDescription("Get user by ID"),
        mcp.WithString("user_id",
            mcp.Required(),
            mcp.Description("User identifier"),
        ),
    )
    mcpSrv.AddTool(userTool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
        userID, ok := req.Params.Arguments["user_id"].(string)
        if !ok {
            return mcp.NewToolResultError("user_id must be a string"), nil
        }
        // Call biz layer
        user, err := userUC.GetUser(ctx, userID)
        if err != nil {
            return mcp.NewToolResultError(err.Error()), nil
        }
        return mcp.NewToolResultText(fmt.Sprintf("User: %s, Email: %s", user.Name, user.Email)), nil
    })

    // Tool 2: Order creation
    orderTool := mcp.NewTool("create_order",
        mcp.WithDescription("Create a new order"),
        mcp.WithString("user_id", mcp.Required()),
        mcp.WithString("product_id", mcp.Required()),
        mcp.WithNumber("quantity", mcp.Required()),
    )
    mcpSrv.AddTool(orderTool, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
        userID, ok := req.Params.Arguments["user_id"].(string)
        if !ok {
            return mcp.NewToolResultError("user_id must be a string"), nil
        }
        productID, ok := req.Params.Arguments["product_id"].(string)
        if !ok {
            return mcp.NewToolResultError("product_id must be a string"), nil
        }
        quantity, ok := req.Params.Arguments["quantity"].(float64)
        if !ok {
            return mcp.NewToolResultError("quantity must be a number"), nil
        }
        
        // Call biz layer
        order, err := orderUC.CreateOrder(ctx, userID, productID, int(quantity))
        if err != nil {
            return mcp.NewToolResultError(err.Error()), nil
        }
        
        return mcp.NewToolResultText(fmt.Sprintf("Order created: %s", order.ID)), nil
    })
}
```

### MCP with Kratos Middleware

Wrap MCP endpoint with Kratos middleware for logging, auth, etc.:

```go
func NewHTTPServer(c *conf.Server, mcpSrv *server.MCPServer, logger log.Logger) *http.Server {
    srv := http.NewServer(
        http.Address(c.Http.Addr),
        http.Middleware(
            recovery.Recovery(),
            tracing.Server(),
            logging.Server(logger),
        ),
    )
    
    // MCP endpoint with middleware chain
    route := srv.Route("/")
    route.GET("/mcp", func(ctx http.Context) error {
        http.SetOperation(ctx, "/mcp/handle")
        h := ctx.Middleware(func(ctx context.Context, req interface{}) (interface{}, error) {
            return handleMCPRequest(ctx, mcpSrv)
        })
        resp, err := h(ctx, nil)
        if err != nil {
            return err
        }
        return ctx.JSON(200, resp)
    })
    
    return srv
}
```

### Health Check

Add health check alongside MCP endpoint:

```go
route := srv.Route("/")
route.GET("/health/ready", func(ctx http.Context) error {
    return ctx.JSON(200, map[string]string{"status": "ok"})
})
route.GET("/mcp", handleMCP)
```

---

## MCP Tool Schema Types

### String Parameter

```go
mcp.WithString("name",
    mcp.Required(),
    mcp.Description("Description of parameter"),
    mcp.Pattern("^[a-z]+$"),  // Optional: regex pattern
)
```

### Number Parameter

```go
mcp.WithNumber("quantity",
    mcp.Required(),
    mcp.Description("Number of items"),
    mcp.MinNumber(1),      // Optional: minimum
    mcp.MaxNumber(100),    // Optional: maximum
)
```

### Boolean Parameter

```go
mcp.WithBoolean("enabled",
    mcp.Description("Enable feature"),
)
```

### Object Parameter

```go
mcp.WithObject("config",
    mcp.Description("Configuration object"),
    mcp.Properties(map[string]mcp.Property{
        "timeout": mcp.NewNumberProperty(30),
        "retries": mcp.NewNumberProperty(3),
    }),
)
```

---

## Result Types

### Text Result

```go
mcp.NewToolResultText("Operation completed successfully")
```

### Error Result

```go
mcp.NewToolResultError("Invalid input: user_id required")
```

### JSON Result

```go
mcp.NewToolResultJSON(map[string]interface{}{
    "user_id": "123",
    "name": "John",
    "email": "john@example.com",
})
```

---

## MCP Client Integration

AI agents discover and call tools via MCP protocol:

1. **Discovery**: Agent calls `list_tools` to get available tools
2. **Schema**: Agent receives tool definitions with parameters
3. **Invocation**: Agent calls `call_tool` with arguments
4. **Response**: Server returns structured result

### Integration Example

Claude Code MCP client configuration:

```json
{
    "mcpServers": {
        "kratos-mcp": {
            "url": "http://localhost:8000/mcp"
        }
    }
}
```

---

## Future Extensions

This reference file can be extended with:

- Plugin system integration
- Custom transport protocols
- Service mesh patterns
- GraphQL gateway
- Event-driven architecture

Check official Kratos documentation for updates: https://go-kratos.dev