import { defineConfig } from "vitepress"

export default defineConfig({
  title: "Peta Stack",
  description: "A modular full-stack TypeScript toolkit for Bun — ORM, auth, API docs, and migrations.",
  cleanUrls: true,

  themeConfig: {
    logo: "/logo.svg",

    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Packages", link: "/packages/orm/plugins" },
      { text: "Reference", link: "/reference/cli" },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Architecture", link: "/guide/architecture" },
          { text: "Integration Patterns", link: "/guide/integration" },
          { text: "Testing", link: "/guide/testing" },
        ],
      },
      {
        text: "Packages",
        items: [
          {
            text: "peta-orm",
            items: [
              { text: "Plugin Authoring", link: "/packages/orm/plugins" },
              { text: "Query Builder Internals", link: "/packages/orm/query-builder" },
            ],
          },
          {
            text: "peta-auth",
            items: [{ text: "Security & Operations", link: "/packages/auth/security" }],
          },
          {
            text: "peta-docs",
            items: [{ text: "Customization", link: "/packages/docs/customization" }],
          },
          {
            text: "peta-migrate",
            items: [{ text: "Advanced Usage", link: "/packages/migrate/advanced" }],
          },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "CLI Reference", link: "/reference/cli" },
          { text: "Environment Variables", link: "/reference/env" },
          { text: "FAQ", link: "/reference/faq" },
        ],
      },
    ],

    socialLinks: [{ icon: "github", link: "https://github.com/zfadhli/peta-stack" }],

    footer: {
      message: "MIT Licensed",
    },
  },
})
