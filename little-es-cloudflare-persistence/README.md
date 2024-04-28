# little-es-cloudflare-persistence

Cloudflare D1 persistence layer for little-es.

```bash
npm i little-es-cloudflare-persistence
```

Usage:

```ts
// ... define your Cloudflare bindings

const persistence = createPersistenceHandler<MYAGGREGATE, MYEVENTS>(env.DB);

// ... now you can pass it little-es aggregates and projections
const todoAggregate = {
    ...
    persistence: persistence
};
```

## Setup

1. Create your D1 database following Cloudflare instructions
2. Run the migrate.sql script you find in this project
3. Add the D1 binding to your app
4. Create a PersistenceHandler using the createPersistenceHandler()
5. Add the handler to your little-es aggregate and projection configurations.
