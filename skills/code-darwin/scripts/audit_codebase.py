#!/usr/bin/env python3
"""Collect repeatable codebase-health signals without modifying the repository."""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


IGNORED_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".gradle",
    ".mypy_cache",
    ".next",
    ".nuxt",
    ".pytest_cache",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "out",
    "Pods",
    "target",
    "vendor",
    "venv",
    ".worktrees",
}

IGNORED_FILENAMES = {
    "Cargo.lock",
    "Gemfile.lock",
    "Pipfile.lock",
    "bun.lockb",
    "composer.lock",
    "go.sum",
    "package-lock.json",
    "pnpm-lock.yaml",
    "poetry.lock",
    "uv.lock",
    "yarn.lock",
}

SOURCE_LANGUAGES = {
    ".c": "C",
    ".cc": "C++",
    ".cpp": "C++",
    ".cs": "C#",
    ".css": "CSS",
    ".dart": "Dart",
    ".ex": "Elixir",
    ".exs": "Elixir",
    ".fs": "F#",
    ".fsx": "F#",
    ".go": "Go",
    ".h": "C/C++",
    ".hpp": "C++",
    ".java": "Java",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".kt": "Kotlin",
    ".kts": "Kotlin",
    ".lua": "Lua",
    ".m": "Objective-C",
    ".mm": "Objective-C++",
    ".php": "PHP",
    ".proto": "Protobuf",
    ".py": "Python",
    ".rb": "Ruby",
    ".rs": "Rust",
    ".scala": "Scala",
    ".scss": "SCSS",
    ".sh": "Shell",
    ".sql": "SQL",
    ".svelte": "Svelte",
    ".swift": "Swift",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".vue": "Vue",
    ".yaml": "YAML",
    ".yml": "YAML",
}

MARKER_RE = re.compile(r"\b(TODO|FIXME|HACK|XXX)\b(?:\s*[:\-]?\s*(.*))?", re.IGNORECASE)
IMPORT_PREFIXES = (
    "import ",
    "from ",
    "using ",
    "package ",
    "#include ",
    "require(",
)


class SourceFile:
    def __init__(
        self,
        path: Path,
        relative_path: str,
        git_relative_path: Optional[str],
        language: str,
        size_bytes: int,
        lines: List[str],
    ) -> None:
        self.path = path
        self.relative_path = relative_path
        self.git_relative_path = git_relative_path
        self.language = language
        self.size_bytes = size_bytes
        self.lines = lines


def run_command(args: Sequence[str], cwd: Path) -> Tuple[int, str, str]:
    try:
        completed = subprocess.run(
            list(args),
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
    except OSError as exc:
        return 127, "", str(exc)
    return completed.returncode, completed.stdout, completed.stderr.strip()


def find_git_root(path: Path) -> Optional[Path]:
    code, stdout, _ = run_command(
        ["git", "-C", str(path), "rev-parse", "--show-toplevel"], path
    )
    if code != 0 or not stdout.strip():
        return None
    return Path(stdout.strip()).resolve()


def is_ignored(relative_path: Path) -> bool:
    return (
        relative_path.name in IGNORED_FILENAMES
        or any(part in IGNORED_DIRS for part in relative_path.parts)
    )


def read_source(path: Path, max_file_bytes: int) -> Optional[Tuple[int, List[str]]]:
    try:
        size_bytes = path.stat().st_size
        if size_bytes > max_file_bytes:
            return None
        raw = path.read_bytes()
    except (OSError, UnicodeError):
        return None

    if b"\x00" in raw[:4096]:
        return None
    return size_bytes, raw.decode("utf-8", errors="replace").splitlines()


def collect_source_files(
    root: Path, git_root: Optional[Path], max_file_bytes: int
) -> Tuple[List[SourceFile], int]:
    source_files: List[SourceFile] = []
    skipped_large = 0

    for path in sorted(root.rglob("*")):
        if path.is_symlink() or not path.is_file():
            continue
        relative_path = path.relative_to(root)
        if is_ignored(relative_path):
            continue
        language = SOURCE_LANGUAGES.get(path.suffix.lower())
        if language is None:
            continue

        try:
            size_bytes = path.stat().st_size
        except OSError:
            continue
        if size_bytes > max_file_bytes:
            skipped_large += 1
            continue

        content = read_source(path, max_file_bytes)
        if content is None:
            continue
        _, lines = content
        git_relative_path = None
        if git_root is not None:
            try:
                git_relative_path = path.relative_to(git_root).as_posix()
            except ValueError:
                git_relative_path = None
        source_files.append(
            SourceFile(
                path=path,
                relative_path=relative_path.as_posix(),
                git_relative_path=git_relative_path,
                language=language,
                size_bytes=size_bytes,
                lines=lines,
            )
        )

    return source_files, skipped_large


def file_metrics(source_file: SourceFile) -> Dict[str, object]:
    markers = []
    long_lines = 0
    max_line_length = 0
    for line_number, line in enumerate(source_file.lines, 1):
        length = len(line)
        max_line_length = max(max_line_length, length)
        if length > 140:
            long_lines += 1
        match = MARKER_RE.search(line)
        if match:
            markers.append(
                {
                    "line": line_number,
                    "kind": match.group(1).upper(),
                    "text": line.strip()[:180],
                }
            )

    return {
        "path": source_file.relative_path,
        "language": source_file.language,
        "bytes": source_file.size_bytes,
        "lines": len(source_file.lines),
        "non_blank_lines": sum(1 for line in source_file.lines if line.strip()),
        "long_lines": long_lines,
        "max_line_length": max_line_length,
        "marker_count": len(markers),
        "markers": markers[:10],
    }


def collect_git_signals(
    scan_root: Path,
    git_root: Optional[Path],
    source_files: Iterable[SourceFile],
    since: str,
) -> Dict[str, object]:
    if git_root is None:
        return {
            "available": False,
            "since": since,
            "commits_analyzed": 0,
            "hotspots": [],
            "note": "No Git repository was found for the scan root.",
        }

    source_by_git_path = {
        source_file.git_relative_path: source_file
        for source_file in source_files
        if source_file.git_relative_path is not None
    }
    code, stdout, stderr = run_command(
        [
            "git",
            "log",
            "--no-renames",
            f"--since={since}",
            "--format=commit:%H",
            "--name-only",
        ],
        git_root,
    )
    if code != 0:
        return {
            "available": False,
            "since": since,
            "commits_analyzed": 0,
            "hotspots": [],
            "note": f"Git history could not be read: {stderr or 'unknown error'}",
        }

    touches = collections.Counter()
    commits_by_path = collections.defaultdict(set)
    commits_analyzed = 0
    current_commit = None
    for line in stdout.splitlines():
        if line.startswith("commit:"):
            current_commit = line[7:]
            commits_analyzed += 1
            continue
        relative_path = line.strip()
        if not relative_path or current_commit is None:
            continue
        source_file = source_by_git_path.get(relative_path)
        if source_file is None:
            continue
        touches[source_file.relative_path] += 1
        commits_by_path[source_file.relative_path].add(current_commit)

    metric_by_path = {item["path"]: item for item in (file_metrics(item) for item in source_files)}
    hotspots = []
    for relative_path, touch_count in touches.items():
        metric = metric_by_path[relative_path]
        hotspots.append(
            {
                "path": relative_path,
                "change_touches": touch_count,
                "commit_count": len(commits_by_path[relative_path]),
                "lines": metric["lines"],
                "marker_count": metric["marker_count"],
            }
        )
    hotspots.sort(
        key=lambda item: (
            -int(item["change_touches"]),
            -int(item["lines"]),
            str(item["path"]),
        )
    )

    branch_code, branch_stdout, _ = run_command(
        ["git", "branch", "--show-current"], git_root
    )
    branch = branch_stdout.strip() if branch_code == 0 else ""
    result = {
        "available": True,
        "git_root": str(git_root),
        "scan_root": str(scan_root),
        "branch": branch,
        "since": since,
        "commits_analyzed": commits_analyzed,
        "hotspots": hotspots,
    }
    return result


def normalize_duplicate_line(line: str) -> str:
    return re.sub(r"\s+", " ", line.strip())


def is_meaningful_duplicate_block(block: Sequence[str], min_lines: int) -> bool:
    meaningful = 0
    for line in block:
        if len(line) < 12:
            continue
        if line.startswith(IMPORT_PREFIXES):
            continue
        if re.fullmatch(r"[{}()\[\],;:.]+", line):
            continue
        meaningful += 1
    return meaningful >= max(3, min_lines // 3)


def collect_duplicate_blocks(
    source_files: Iterable[SourceFile], min_lines: int, limit: int
) -> List[Dict[str, object]]:
    source_files = list(source_files)
    fingerprints = collections.defaultdict(list)
    for source_file in source_files:
        normalized = [
            (line_number, normalize_duplicate_line(line))
            for line_number, line in enumerate(source_file.lines, 1)
            if line.strip()
        ]
        if len(normalized) < min_lines:
            continue
        for index in range(len(normalized) - min_lines + 1):
            window = normalized[index : index + min_lines]
            if window[-1][0] - window[0][0] > min_lines * 2:
                continue
            block = [line for _, line in window]
            if not is_meaningful_duplicate_block(block, min_lines):
                continue
            fingerprint = hashlib.sha1("\n".join(block).encode("utf-8")).hexdigest()
            fingerprints[fingerprint].append(
                {
                    "path": source_file.relative_path,
                    "start_line": window[0][0],
                    "end_line": window[-1][0],
                }
            )

    candidates = []
    for fingerprint, occurrences in fingerprints.items():
        by_path = collections.defaultdict(list)
        for occurrence in occurrences:
            by_path[occurrence["path"]].append(occurrence)
        if len(by_path) < 2:
            continue
        selected_occurrences = [
            sorted(path_occurrences, key=lambda item: int(item["start_line"]))[0]
            for _, path_occurrences in sorted(by_path.items())
        ]
        candidates.append(
            {
                "fingerprint": fingerprint[:12],
                "line_count": min_lines,
                "file_count": len(selected_occurrences),
                "occurrence_count": len(occurrences),
                "occurrences": selected_occurrences,
                "preview": [
                    line[:180]
                    for line in next(
                        item.lines
                        for item in source_files
                        if item.relative_path == selected_occurrences[0]["path"]
                    )[
                        int(selected_occurrences[0]["start_line"]) - 1 : int(
                            selected_occurrences[0]["start_line"]
                        )
                        + min(2, min_lines - 1)
                    ]
                ],
            }
        )

    candidates.sort(
        key=lambda item: (
            -int(item["file_count"]),
            -int(item["line_count"]),
            -int(item["occurrence_count"]),
            str(item["occurrences"]),
        )
    )

    selected = []
    for candidate in candidates:
        if any(duplicate_region(candidate, existing, min_lines) for existing in selected):
            continue
        selected.append(candidate)
        if len(selected) >= limit:
            break
    return selected


def duplicate_region(
    first: Dict[str, object], second: Dict[str, object], min_lines: int
) -> bool:
    first_occurrences = {item["path"]: item for item in first["occurrences"]}
    second_occurrences = {item["path"]: item for item in second["occurrences"]}
    if set(first_occurrences) != set(second_occurrences):
        return False
    return all(
        abs(
            int(first_occurrences[path]["start_line"])
            - int(second_occurrences[path]["start_line"])
        )
        <= min_lines
        for path in first_occurrences
    )


def build_report(args: argparse.Namespace) -> Dict[str, object]:
    scan_root = Path(args.root).expanduser().resolve()
    if not scan_root.exists() or not scan_root.is_dir():
        raise ValueError(f"Scan root is not a directory: {scan_root}")

    git_root = find_git_root(scan_root)
    source_files, skipped_large = collect_source_files(
        scan_root, git_root, args.max_file_bytes
    )
    metrics = [file_metrics(source_file) for source_file in source_files]
    languages = collections.Counter(item["language"] for item in metrics)
    total_lines = sum(int(item["lines"]) for item in metrics)
    total_non_blank_lines = sum(int(item["non_blank_lines"]) for item in metrics)
    total_bytes = sum(int(item["bytes"]) for item in metrics)
    metric_by_path = {item["path"]: item for item in metrics}

    large_files = [
        {
            "path": item["path"],
            "language": item["language"],
            "lines": item["lines"],
            "bytes": item["bytes"],
            "marker_count": item["marker_count"],
        }
        for item in metrics
        if int(item["lines"]) >= args.large_file_lines
    ]
    large_files.sort(key=lambda item: (-int(item["lines"]), str(item["path"])))

    markers = [
        {
            "path": item["path"],
            "count": item["marker_count"],
            "markers": item["markers"],
        }
        for item in metrics
        if int(item["marker_count"]) > 0
    ]
    markers.sort(key=lambda item: (-int(item["count"]), str(item["path"])))

    duplicate_blocks = collect_duplicate_blocks(
        source_files, args.min_duplicate_lines, args.top
    )
    git_signals = collect_git_signals(
        scan_root, git_root, source_files, args.since
    )
    hotspots = list(git_signals.get("hotspots", []))[: args.top]

    notes = [
        "Source files under common dependency, build, cache, and VCS directories are excluded.",
        "Duplicate candidates are exact normalized text windows and require semantic review before extraction.",
        f"Files larger than {args.max_file_bytes} bytes are skipped by the content scanner.",
    ]
    if skipped_large:
        notes.append(f"Skipped {skipped_large} source file(s) above the size limit.")
    if not bool(git_signals.get("available")):
        notes.append(str(git_signals.get("note")))

    return {
        "schema_version": 1,
        "generated_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "root": str(scan_root),
        "inventory": {
            "source_files": len(source_files),
            "source_lines": total_lines,
            "non_blank_lines": total_non_blank_lines,
            "source_bytes": total_bytes,
            "languages": dict(sorted(languages.items())),
        },
        "git": git_signals,
        "large_files": large_files[: args.top],
        "hotspots": hotspots,
        "duplicate_blocks": duplicate_blocks,
        "markers": markers[: args.top],
        "notes": notes,
        "options": {
            "since": args.since,
            "large_file_lines": args.large_file_lines,
            "min_duplicate_lines": args.min_duplicate_lines,
            "max_file_bytes": args.max_file_bytes,
            "top": args.top,
        },
    }


def markdown_escape(value: object) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def format_markdown(report: Dict[str, object]) -> str:
    inventory = report["inventory"]
    git_data = report["git"]
    lines = [
        "# Codebase Rot Audit",
        "",
        f"- Root: `{report['root']}`",
        f"- Generated: `{report['generated_at_utc']}`",
        f"- Source files: {inventory['source_files']}",
        f"- Source lines: {inventory['source_lines']} ({inventory['non_blank_lines']} non-blank)",
        f"- Languages: {', '.join(f'{key} ({value})' for key, value in inventory['languages'].items()) or 'none'}",
        f"- Git history: {'available' if git_data.get('available') else 'unavailable'}",
        "",
        "## Change Hotspots",
        "",
        "| Path | Touches | Commits | Lines | Markers |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    hotspots = report["hotspots"]
    if hotspots:
        lines.extend(
            f"| `{markdown_escape(item['path'])}` | {item['change_touches']} | {item['commit_count']} | {item['lines']} | {item['marker_count']} |"
            for item in hotspots
        )
    else:
        lines.append("| None detected |  |  |  |  |")

    lines.extend(
        [
            "",
            "## Large Files",
            "",
            "| Path | Language | Lines | Bytes | Markers |",
            "| --- | --- | ---: | ---: | ---: |",
        ]
    )
    large_files = report["large_files"]
    if large_files:
        lines.extend(
            f"| `{markdown_escape(item['path'])}` | {item['language']} | {item['lines']} | {item['bytes']} | {item['marker_count']} |"
            for item in large_files
        )
    else:
        lines.append("| None above threshold |  |  |  |  |")

    lines.extend(["", "## Repeated Code Candidates", ""])
    duplicate_blocks = report["duplicate_blocks"]
    if not duplicate_blocks:
        lines.append("No cross-file exact duplicate windows met the configured threshold.")
    else:
        for index, candidate in enumerate(duplicate_blocks, 1):
            locations = ", ".join(
                f"`{item['path']}:{item['start_line']}-{item['end_line']}`"
                for item in candidate["occurrences"]
            )
            lines.append(
                f"{index}. {locations} ({candidate['line_count']} normalized lines, {candidate['occurrence_count']} windows)"
            )
            preview = " / ".join(candidate["preview"])
            lines.append(f"   Preview: `{markdown_escape(preview)}`")

    lines.extend(["", "## TODO and FIXME Markers", ""])
    markers = report["markers"]
    if markers:
        for item in markers:
            examples = "; ".join(
                f"{marker['kind']}@{marker['line']}" for marker in item["markers"]
            )
            lines.append(f"- `{item['path']}`: {item['count']} ({examples})")
    else:
        lines.append("No configured markers detected.")

    lines.extend(["", "## Limits", ""])
    lines.extend(f"- {note}" for note in report["notes"])
    return "\n".join(lines) + "\n"


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Collect read-only codebase health signals."
    )
    parser.add_argument("--root", default=".", help="Repository or subdirectory to scan")
    parser.add_argument(
        "--format", choices=("json", "markdown"), default="json", help="Output format"
    )
    parser.add_argument(
        "--top", type=int, default=20, help="Maximum entries per report section"
    )
    parser.add_argument(
        "--since", default="12 months ago", help="Git history window passed to git log"
    )
    parser.add_argument(
        "--large-file-lines",
        type=int,
        default=500,
        help="Minimum lines for the large-file section",
    )
    parser.add_argument(
        "--min-duplicate-lines",
        type=int,
        default=8,
        help="Minimum normalized lines for an exact duplicate candidate",
    )
    parser.add_argument(
        "--max-file-bytes",
        type=int,
        default=2_000_000,
        help="Skip source files larger than this size while reading content",
    )
    parser.add_argument(
        "--output", help="Optional output path; stdout is used when omitted"
    )
    args = parser.parse_args(argv)
    if args.top < 1:
        parser.error("--top must be at least 1")
    if args.large_file_lines < 1:
        parser.error("--large-file-lines must be at least 1")
    if args.min_duplicate_lines < 3:
        parser.error("--min-duplicate-lines must be at least 3")
    if args.max_file_bytes < 1:
        parser.error("--max-file-bytes must be positive")
    return args


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    try:
        report = build_report(args)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    rendered = (
        json.dumps(report, ensure_ascii=False, indent=2) + "\n"
        if args.format == "json"
        else format_markdown(report)
    )
    if args.output:
        Path(args.output).expanduser().write_text(rendered, encoding="utf-8")
    else:
        sys.stdout.write(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
