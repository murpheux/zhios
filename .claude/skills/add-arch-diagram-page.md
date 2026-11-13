# add-arch-diagram-page

Add a new architecture diagram page to the project's architecture.drawio file.

## Usage

```
/add-arch-diagram-page [--position before|after <page-name>] [--title "Page Title"] [--style microservices|layered|dataflow] <description>
```

## Parameters

- `description` (required): What the diagram should show (e.g., "Client tier → microservices with APIs and databases")
- `--position`: Where to insert the page relative to existing pages (default: after current last page)
  - `before <page-name>`: Insert before a named page (e.g., `before "Logical Architecture"`)
  - `after <page-name>`: Insert after a named page
- `--title`: Custom page title (default: auto-generated from description)
- `--style`: Diagram style to follow (default: auto-detect from description)
  - `microservices`: Tier-based layout with boxed services, colored by domain
  - `layered`: Horizontal layers (presentation → application → data)
  - `dataflow`: Flow diagram showing requests/data movement

## Workflow

1. **Architect** reads project context and designs the diagram:
   - Layout and structure (tiers, services, connections)
   - Visual style (colors, borders, icons, typography)
   - Component list and relationships
   - Constraints (fit with existing pages, integration points)

2. **Architect** produces a specification document:
   - Title and purpose
   - List of visual elements (boxes, icons, labels, arrows)
   - Color scheme and styling rules
   - Connection/edge definitions
   - Sizing and positioning hints

3. **Developer** implements the diagram in drawio:
   - Opens `architecture/architecture.drawio`
   - Creates a new page at the specified position
   - Adds elements according to the architect's spec
   - Validates against existing pages (visual consistency)
   - Tests insertion (page loads, no corruption)

## Example

```
/add-arch-diagram-page \
  --position before "Logical Architecture" \
  --title "zhios System Overview" \
  --style microservices \
  "Show gnee clients (web/mobile) connecting to ozzo (auth/subscriptions) and zuma (wallet/transactions) microservices, with yone notifications service, PostgreSQL and MongoDB datastores, and Redis cache. Highlight the API Gateway as the entry point. Use tier-based layout with colored service domains."
```

## Output

A new page in `architecture/architecture.drawio` positioned as requested, following the project's existing diagram style. Page is committed to git with a message like:

```
docs(arch): add System Overview page to architecture diagram
```

## Notes

- The architect should review existing pages for color/styling consistency
- Developer must validate that the drawio file loads correctly after insertion
- Large diagrams may need to be split across multiple pages
- All text should use the same fonts/sizes as existing pages

## Related

- `architecture/architecture.drawio` — the target file
- Existing pages: Logical Architecture, AWS Deployment, Network Security, Resilience & Deploy
- Style guide: See the existing pages for color/box/icon conventions
