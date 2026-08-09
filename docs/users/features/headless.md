# Headless Mode

Headless mode allows you to run OpenGame programmatically from command line
scripts and automation tools without any interactive UI. This is ideal for
scripting, automation, CI/CD pipelines, and building AI-powered tools.

## Overview

The headless mode provides a headless interface to OpenGame that:

- Accepts prompts via command line arguments or stdin
- Returns structured output (text or JSON)
- Supports file redirection and piping
- Enables automation and scripting workflows
- Provides consistent exit codes for error handling
- Can resume previous sessions scoped to the current project for multi-step automation

## Basic Usage

### Direct Prompts

Use the `--prompt` (or `-p`) flag to run in headless mode:

```bash
opengame --prompt "What is machine learning?"
```

### Stdin Input

Pipe input to OpenGame from your terminal:

```bash
echo "Explain this code" | opengame
```

### Combining with File Input

Read from files and process with OpenGame:

```bash
cat README.md | opengame --prompt "Summarize this documentation"
```

### Resume Previous Sessions (Headless)

Reuse conversation context from the current project in headless scripts:

```bash
# Continue the most recent session for this project and run a new prompt
opengame --continue -p "Run the tests again and summarize failures"

# Resume a specific session ID directly (no UI)
opengame --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - Session data is project-scoped JSONL under `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Restores conversation history, tool outputs, and chat-compression checkpoints before sending the new prompt.

## Output Formats

OpenGame supports multiple output formats for different use cases:

### Text Output (Default)

Standard human-readable output:

```bash
opengame -p "What is the capital of France?"
```

Response format:

```
The capital of France is Paris.
```

### JSON Output

Returns structured data as a JSON array. All messages are buffered and output together when the session completes. This format is ideal for programmatic processing and automation scripts.

The JSON output is an array of message objects. The output includes multiple message types: system messages (session initialization), assistant messages (AI responses), and result messages (execution summary).

#### Example Usage

```bash
opengame -p "What is the capital of France?" --output-format json
```

Output (at end of execution):

```json
[
  {
    "type": "system",
    "subtype": "session_start",
    "uuid": "...",
    "session_id": "...",
    "model": "qwen3-coder-plus",
    ...
  },
  {
    "type": "assistant",
    "uuid": "...",
    "session_id": "...",
    "message": {
      "id": "...",
      "type": "message",
      "role": "assistant",
      "model": "qwen3-coder-plus",
      "content": [
        {
          "type": "text",
          "text": "The capital of France is Paris."
        }
      ],
      "usage": {...}
    },
    "parent_tool_use_id": null
  },
  {
    "type": "result",
    "subtype": "success",
    "uuid": "...",
    "session_id": "...",
    "is_error": false,
    "duration_ms": 1234,
    "result": "The capital of France is Paris.",
    "usage": {...}
  }
]
```

### Stream-JSON Output

Stream-JSON format emits JSON messages immediately as they occur during execution, enabling real-time monitoring. This format uses line-delimited JSON where each message is a complete JSON object on a single line.

```bash
opengame -p "Explain TypeScript" --output-format stream-json
```

Output (streaming as events occur):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

When combined with `--include-partial-messages`, additional stream events are emitted in real-time (message_start, content_block_delta, etc.) for real-time UI updates.

```bash
opengame -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Input Format

The `--input-format` parameter controls how OpenGame consumes input from standard input:

- **`text`** (default): Standard text input from stdin or command-line arguments
- **`stream-json`**: JSON message protocol via stdin for bidirectional communication

> **Note:** Stream-json input mode is currently under construction and is intended for SDK integration. It requires `--output-format stream-json` to be set.

### File Redirection

Save output to files or pipe to other commands:

```bash
# Save to file
opengame -p "Explain Docker" > docker-explanation.txt
opengame -p "Explain Docker" --output-format json > docker-explanation.json

# Append to file
opengame -p "Add more details" >> docker-explanation.txt

# Pipe to other tools
opengame -p "What is Kubernetes?" --output-format json | jq '.response'
opengame -p "Explain microservices" | wc -w
opengame -p "List programming languages" | grep -i "python"

# Stream-JSON output for real-time processing
opengame -p "Explain Docker" --output-format stream-json | jq '.type'
opengame -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Configuration Options

Key command-line options for headless usage:

| Option                       | Description                                             | Example                                                                      |
| ---------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `--prompt`, `-p`             | Run in headless mode                                    | `opengame -p "query"`                                                        |
| `--output-format`, `-o`      | Specify output format (text, json, stream-json)         | `opengame -p "query" --output-format json`                                   |
| `--input-format`             | Specify input format (text, stream-json)                | `opengame --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Include partial messages in stream-json output          | `opengame -p "query" --output-format stream-json --include-partial-messages` |
| `--debug`, `-d`              | Enable debug mode                                       | `opengame -p "query" --debug`                                                |
| `--all-files`, `-a`          | Include all files in context                            | `opengame -p "query" --all-files`                                            |
| `--include-directories`      | Include additional directories                          | `opengame -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | Auto-approve all actions                                | `opengame -p "query" --yolo`                                                 |
| `--approval-mode`            | Set approval mode                                       | `opengame -p "query" --approval-mode auto_edit`                              |
| `--continue`                 | Resume the most recent session for this project         | `opengame --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | Resume a specific session (or choose interactively)     | `opengame --resume 123e... -p "Finish the refactor"`                         |
| `--experimental-skills`      | Enable experimental Skills (registers the `skill` tool) | `opengame --experimental-skills -p "What Skills are available?"`             |

### Approval mode in headless runs

In headless mode the model can't ask for confirmation, so OpenGame gates tools that would normally prompt:

| Effective approval mode          | `write_file` / `replace` | `run_shell_command` |
| -------------------------------- | ------------------------ | ------------------- |
| `default` / `plan`               | excluded                 | excluded            |
| `auto-edit` _(headless default)_ | allowed                  | excluded            |
| `yolo`                           | allowed                  | allowed             |

When you launch a headless run (e.g. `opengame -p "..."`) without `--yolo`, `--approval-mode`, or a `tools.approvalMode` setting, OpenGame **auto-elevates the approval mode to `auto-edit`** so the model can actually create and modify files. Shell execution stays disabled until you explicitly opt in:

```bash
# headless default: write/edit allowed, shell blocked
opengame -p "Build a Snake clone with WASD controls and a dark theme."

# allow shell commands as well
opengame -p "Build a Snake clone..." --yolo
# equivalent
opengame -p "Build a Snake clone..." --approval-mode yolo

# fully restrictive: nothing that would prompt is available
opengame -p "Build a Snake clone..." --approval-mode default
```

If a folder isn't trusted, the approval mode is still forced back to `default` regardless of the above.

For complete details on all available configuration options, settings files, and environment variables, see the [Configuration Guide](../configuration/settings).

## Examples

### Code review

```bash
cat src/auth.py | opengame -p "Review this authentication code for security issues" > security-review.txt
```

### Generate commit messages

```bash
result=$(git diff --cached | opengame -p "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.response'
```

### API documentation

```bash
result=$(cat api/routes.js | opengame -p "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### Batch code analysis

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | opengame -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

### PR code review

```bash
result=$(git diff origin/main...HEAD | opengame -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Log analysis

```bash
grep "ERROR" /var/log/app.log | tail -20 | opengame -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

### Release notes generation

```bash
result=$(git log --oneline v1.0.0..HEAD | opengame -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Model and tool usage tracking

```bash
result=$(opengame -p "Explain this database schema" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens tokens, $tool_calls tool calls ($tools_used) used with models: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Recent usage trends:"
tail -5 usage.log
```

## Resources

- [CLI Configuration](../configuration/settings#command-line-arguments) - Complete configuration guide
- [Authentication](../configuration/settings#environment-variables-for-api-access) - Setup authentication
- [Commands](../features/commands) - Interactive commands reference
- [Tutorials](../quickstart) - Step-by-step automation guides
