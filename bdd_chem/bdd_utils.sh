#!/usr/bin/env bash

# BDD Toolkit Utilities
# Usage: 
#   ./bdd_utils.sh lint  [features_dir]
#   ./bdd_utils.sh audit [features_dir] [adr_dir]
#   ./bdd_utils.sh index [features_dir] [output_file]

COMMAND=${1:-"help"}
FEATURES_DIR=${2:-"features"}
OUTPUT_FILE=${3:-""}

if [ ! -d "$FEATURES_DIR" ] && [ "$COMMAND" != "help" ]; then
    echo "Error: Directory '$FEATURES_DIR' does not exist."
    exit 1
fi

# Pure-bash Tripartite Audit Engine
run_bash_tripartite_audit() {
    local feat_dir="$1"
    local adr_dir="${2:-docs/adr}"
    local summary_mode=0
    local strict_mode=0

    shift 2 2>/dev/null || true
    for arg in "$@"; do
        if [ "$arg" = "--summary" ]; then summary_mode=1; fi
        if [ "$arg" = "--strict" ]; then strict_mode=1; fi
    done

    local total_features=0
    local unanchored_features=()
    local uncovered_features=()
    local broken_refs=()

    while IFS= read -r f; do
        [ -z "$f" ] && continue
        ((total_features++))
        
        # Check ADR link (either @adr:<path>, @governs:<path>, @governed_by:<path> or narrative [ADR](docs/adr/...))
        if ! grep -qE '(@(adr|governs|governed_by):|\[(ADR|Architectural Decision)[^]]*\]\(docs/adr/)' "$f"; then
            unanchored_features+=("$f")
        fi
        
        # Check code/test coverage link (@covers: or @specifies:)
        if ! grep -qE "@(covers|specifies):" "$f"; then
            uncovered_features+=("$f")
        fi

        # Check for broken ADR links
        while IFS= read -r tag; do
            [ -z "$tag" ] && continue
            local target="${tag#*:}"
            target="${target%[),;]*}"
            if [ ! -f "$target" ]; then
                broken_refs+=("$f -> $tag")
            fi
        done < <(grep -oE "@(adr|governs|governed_by):[^ ]+" "$f" || true)

        # Check for broken covers links
        while IFS= read -r tag; do
            [ -z "$tag" ] && continue
            local target="${tag#*:}"
            target="${target%[),;]*}"
            if [ ! -f "$target" ]; then
                broken_refs+=("$f -> $tag")
            fi
        done < <(grep -oE "@(covers|specifies):[^ ]+" "$f" || true)

    done < <(find "$feat_dir" -type f -name "*.feature" | sort)

    local total_adrs=0
    local disconnected_adrs=()
    if [ -d "$adr_dir" ]; then
        while IFS= read -r adr; do
            [ -z "$adr" ] && continue
            local base
            base=$(basename "$adr")
            if [ "$base" = "README.md" ] || [ "$base" = "template.md" ]; then
                continue
            fi
            ((total_adrs++))
            
            if ! grep -rqF "$adr" "$feat_dir" 2>/dev/null; then
                disconnected_adrs+=("$adr")
            fi
        done < <(find "$adr_dir" -maxdepth 2 -type f -name "*.md" 2>/dev/null | sort)
    fi

    local connected_adrs=$((total_adrs - ${#disconnected_adrs[@]}))
    local adr_pct=100
    if [ $total_adrs -gt 0 ]; then
        adr_pct=$(( (connected_adrs * 100) / total_adrs ))
    fi

    # Calculate fully linked features (neither unanchored nor uncovered)
    local bad_features=0
    for f in "${unanchored_features[@]}"; do
        ((bad_features++))
    done
    for f in "${uncovered_features[@]}"; do
        local already=0
        for uf in "${unanchored_features[@]}"; do
            if [ "$uf" = "$f" ]; then already=1; break; fi
        done
        if [ $already -eq 0 ]; then
            ((bad_features++))
        fi
    done
    local linked_features=$((total_features - bad_features))
    local feat_pct=100
    if [ $total_features -gt 0 ]; then
        feat_pct=$(( (linked_features * 100) / total_features ))
    fi

    if [ $summary_mode -eq 1 ]; then
        echo "  ADR Realization:  $connected_adrs/$total_adrs ($adr_pct%) specified by features"
        echo "  Feature Health:   $linked_features/$total_features ($feat_pct%) fully linked"
        if [ ${#broken_refs[@]} -gt 0 ]; then
            echo "  ⚠️ Broken Links:   ${#broken_refs[@]} dead path references!"
        fi
        if [ ${#unanchored_features[@]} -gt 0 ] || [ ${#disconnected_adrs[@]} -gt 0 ]; then
            echo "  ⚠️ Disconnected:   ${#unanchored_features[@]} specs missing @adr:, ${#disconnected_adrs[@]} ADRs unreferenced"
        fi
        return 0
    fi

    echo ""
    echo "======================================================================"
    echo "       BDD CHEM TRIPARTITE AUDIT (ADRs ↔ Specs ↔ Code)                "
    echo "======================================================================"
    echo ""
    echo "📊 Health Summary:"
    echo "  • ADR Realization Coverage:   $connected_adrs / $total_adrs ADRs specified by features ($adr_pct%)"
    echo "  • Feature Tripartite Health:  $linked_features / $total_features features fully linked ($feat_pct%)"
    echo ""
    if [ ${#broken_refs[@]} -gt 0 ]; then
        echo "❌ Broken Path References (${#broken_refs[@]}):"
        for b in "${broken_refs[@]}"; do
            echo "  • $b (file does not exist!)"
        done
        echo ""
    fi
    if [ ${#disconnected_adrs[@]} -gt 0 ]; then
        echo "🟣 Disconnected ADRs (unrealized / missing specifying .feature) (${#disconnected_adrs[@]}):"
        for a in "${disconnected_adrs[@]}"; do
            echo "  • $a"
        done
        echo ""
    fi
    if [ ${#unanchored_features[@]} -gt 0 ]; then
        echo "🔴 Unanchored Features (missing governing ADR / @adr:<path>) (${#unanchored_features[@]}):"
        for u in "${unanchored_features[@]}"; do
            echo "  • $u"
        done
        echo ""
    fi
    if [ ${#uncovered_features[@]} -gt 0 ]; then
        echo "🟡 Uncovered Features (missing @covers:<path>) (${#uncovered_features[@]}):"
        for c in "${uncovered_features[@]}"; do
            echo "  • $c"
        done
        echo ""
    fi
    echo "======================================================================"
    echo ""

    if [ $strict_mode -eq 1 ]; then
        if [ ${#broken_refs[@]} -gt 0 ] || [ ${#disconnected_adrs[@]} -gt 0 ] || [ ${#unanchored_features[@]} -gt 0 ]; then
            echo "❌ Tripartite audit failed in --strict mode."
            return 1
        fi
    fi
    return 0
}

case "$COMMAND" in
    lint)
        echo "🔍 Linting BDD directory: $FEATURES_DIR"
        ERROR=0

        # Find all feature files
        while IFS= read -r file; do
            # Get relative path without the base directory
            rel_path="${file#$FEATURES_DIR/}"
            
            # 1. Check Directory Nesting (must be exactly domain/layer/file.feature)
            dir_count=$(echo "$rel_path" | tr -cd '/' | wc -c)
            if [ "$dir_count" -ne 2 ]; then
                echo "❌ ERROR: '$rel_path' violates nesting. Must be <domain>/<layer>/<filename>."
                ERROR=1
                continue
            fi

            # 2. Check Naming Convention (aspect-counter.feature)
            filename=$(basename "$file")
            if [[ ! $filename =~ ^[a-z0-9_]+-([0-9]+)\.feature$ ]]; then
                echo "❌ ERROR: '$filename' violates naming convention. Must be <aspect>-<counter>.feature (e.g., login_flow-10.feature)."
                ERROR=1
                continue
            fi
        done < <(find "$FEATURES_DIR" -type f -name "*.feature")

        if [ $ERROR -eq 0 ]; then
            echo "✅ All BDD files pass the layout convention rules!"
            
            # Advisory Tripartite Connectivity Check
            echo ""
            echo "🔗 Tripartite Health Check (ADRs ↔ Specs ↔ Code):"
            if command -v node >/dev/null 2>&1 && [ -f "scripts/audit-tripartite.mjs" ]; then
                node scripts/audit-tripartite.mjs --summary "$FEATURES_DIR" "docs/adr"
            else
                run_bash_tripartite_audit "$FEATURES_DIR" "docs/adr" --summary
            fi
            echo "💡 Run './bdd_utils.sh audit' or './bdd_utils.sh check-links' for full report."
            exit 0
        else
            echo "❌ Linting failed."
            exit 1
        fi
        ;;
        
    audit|check-links|tripartite)
        if command -v node >/dev/null 2>&1 && [ -f "scripts/audit-tripartite.mjs" ]; then
            node scripts/audit-tripartite.mjs "$FEATURES_DIR" "${3:-docs/adr}" "${@:4}"
        else
            run_bash_tripartite_audit "$FEATURES_DIR" "${3:-docs/adr}" "${@:4}"
        fi
        ;;
        
    index)
        # Build the table content
        TABLE_HEADER="# Feature Index\n\n> Auto-generated by \`bdd_utils.sh index\`. Do not edit manually.\n\n| Domain | Layer | Seq | Feature File | Capability Description |\n| :--- | :--- | :---: | :--- | :--- |"
        TABLE_ROWS=""

        # Find and sort all feature files to guarantee chronological output
        while IFS= read -r file; do
            rel_path="${file#$FEATURES_DIR/}"
            
            domain=$(echo "$rel_path" | cut -d'/' -f1)
            layer=$(echo "$rel_path" | cut -d'/' -f2)
            filename=$(basename "$file")
            
            if [[ $filename =~ ^[a-z0-9_]+-([0-9]+)\.feature$ ]]; then
                sequence="${BASH_REMATCH[1]}"
            else
                sequence="-"
            fi
            
            # Extract capability description from the "Feature: " line
            desc=$(grep -m 1 -E "^Feature:" "$file" | sed -E 's/^Feature:[[:space:]]*//' | tr -d '\r')
            if [ -z "$desc" ]; then
                desc="*No Feature description found*"
            fi
            
            TABLE_ROWS="$TABLE_ROWS\n| **$domain** | **$layer** | $sequence | \`$rel_path\` | $desc |"
        done < <(find "$FEATURES_DIR" -type f -name "*.feature" | sort)

        OUTPUT="$TABLE_HEADER$TABLE_ROWS"

        if [ -n "$OUTPUT_FILE" ]; then
            echo -e "$OUTPUT" > "$OUTPUT_FILE"
            echo "📝 Feature index written to: $OUTPUT_FILE"
        else
            echo -e "$OUTPUT"
        fi
        ;;
        
    *)
        echo "BDD Toolkit Utilities"
        echo "Usage:"
        echo "  $0 lint  [directory]              - Validates nested structure, naming conventions, and tripartite health."
        echo "  $0 audit [directory] [adr_dir]    - Audits semantic links between ADRs, Features, and Code/Tests."
        echo "  $0 index [directory] [output_file] - Generates a Markdown feature index table."
        echo ""
        echo "If output_file is omitted, index prints to stdout."
        echo "If output_file is provided, the table is written to that file."
        echo ""
        echo "Examples:"
        echo "  $0 lint ./features"
        echo "  $0 audit ./features ./docs/adr"
        echo "  $0 index ./features ./features/INDEX.md"
        ;;
esac
