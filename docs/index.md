---
layout: home

hero:
  name: "Peta Stack"
  text: "Modular TypeScript toolkit for Bun"
  tagline: ORM, auth, API docs, and migrations — designed to work together or standalone.
  image:
    src: /logo.svg
    alt: Peta Stack
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/zfadhli/peta-stack

features:
  - icon: 🗄️
    title: peta-orm
    details: ActiveRecord-style ORM built on Kysely with ArkType validation. Relations, hooks, soft deletes, polymorphic support, eager loading, and graph operations.
    link: https://github.com/zfadhli/peta-stack/tree/main/packages/orm
  - icon: 🔐
    title: peta-auth
    details: Stateless encrypted cookie sessions for Hono, ElysiaJS, and Nuxt. JWT, CSRF, OAuth, password hashing and reset flows.
    link: https://github.com/zfadhli/peta-stack/tree/main/packages/auth
  - icon: 📖
    title: peta-docs
    details: OpenAPI 3.1 spec generation from ArkType-typed routes. Scalar UI, auto-validation, filesystem routing.
    link: https://github.com/zfadhli/peta-stack/tree/main/packages/docs
  - icon: 🔄
    title: peta-migrate
    details: Standalone migration runner and generator with programmatic API and CLI.
    link: https://github.com/zfadhli/peta-stack/tree/main/packages/migrate
---
