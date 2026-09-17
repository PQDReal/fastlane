# Architecture

## Application boundary

FASTLANE uses a Next.js backend-for-frontend design: the web interface calls API routes that handle identity, validation, data access, and workflow operations. Auth0 supplies authentication; authorization remains a server-side responsibility. Supabase/PostgreSQL stores application data, while Redis provides caching.

The implementation's README and package manifest identify Next.js 15, React 19, TypeScript, Auth0, Supabase, Redis, OpenAPI, and Vitest. The manifest also includes the OpenAI provider integration and tools for parsing web and document content.

## Commerce workflows

| Area | Purpose |
| --- | --- |
| Catalog and variants | Organize vehicles, accessories, and product options |
| Inventory | Track stock and support availability checks |
| Cart and orders | Connect product selection to order workflows |
| Showrooms and reservations | Support test drives and customer follow-up |
| Admin interface | Manage product information and operational requests |
| Identity and permissions | Control access to customer and administrative operations |

The project overview, source tree, and candidate's existing CV support these areas. A source-tree review establishes that modules exist; it is not a production behavior audit.

## Product facts and AI assistance

Public reference material enters an extraction and normalization process. Structured facts retain the context needed to interpret a measurement, distinguish variants, and handle conflicting observations. Retrieval makes that information available to product search and assistant responses.

Examples of concerns represented in the reviewed test definitions include:

- Normalizing units and locale-specific values.
- Preserving source qualifiers instead of flattening them into a misleading number.
- Reporting ambiguity rather than guessing a technical meaning.
- Preventing partial or lower-authority observations from replacing canonical facts.
- Keeping a controlled fallback when a newer fact schema is unavailable.

These are implementation concerns found in test definitions, not new benchmark results. See [testing](testing.md).

## Documentation scope

This is a high-level account of the application, prepared for portfolio review. Operational endpoints, authentication settings, customer data, source assets, and environment configuration are maintained with the application and are not reproduced here.
