import { hashPassword } from "peta-auth"
import { Article, ArticleTag, Comment, Favorite, Follow, getORM, Tag, User } from "./schema.js"

const orm = getORM()

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const jake = await User.insert({
  email: "jake@jake.jake",
  username: "jake",
  password: await hashPassword("jakejake"),
  bio: "I work at statefarm",
  image: "https://i.stack.imgur.com/xHWG8.jpg",
})

const alice = await User.insert({
  email: "alice@example.com",
  username: "alice",
  password: await hashPassword("alice123"),
  bio: "Avid reader and writer",
  image: null,
})

const bob = await User.insert({
  email: "bob@example.com",
  username: "bob",
  password: await hashPassword("bob123"),
  bio: "Software developer and blogger",
  image: null,
})

console.log(`Users: ${jake.get("username")}, ${alice.get("username")}, ${bob.get("username")}`)

// ---------------------------------------------------------------------------
// Follows
// ---------------------------------------------------------------------------

await Follow.insert({ followerId: alice.get<string>("id"), followeeId: jake.get<string>("id") })
await Follow.insert({ followerId: bob.get<string>("id"), followeeId: jake.get<string>("id") })
console.log("Follows: Alice and Bob follow Jake")

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

const tagReact = await Tag.insert({ name: "reactjs" })
const tagAngular = await Tag.insert({ name: "angularjs" })
const tagDragons = await Tag.insert({ name: "dragons" })
const tagTraining = await Tag.insert({ name: "training" })
console.log(
  `Tags: ${tagReact.get("name")}, ${tagAngular.get("name")}, ${tagDragons.get("name")}, ${tagTraining.get("name")}`,
)

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

const article1 = await Article.insert({
  slug: "how-to-train-your-dragon",
  title: "How to train your dragon",
  description: "Ever wonder how?",
  body: "It takes a Jacobian",
  authorId: jake.get<string>("id"),
})

const article2 = await Article.insert({
  slug: "the-art-of-writing-clean-code",
  title: "The Art of Writing Clean Code",
  description: "Tips and tricks for better code",
  body: "Clean code is not just about making the computer happy...",
  authorId: alice.get<string>("id"),
})

const article3 = await Article.insert({
  slug: "understanding-typescript-generics",
  title: "Understanding TypeScript Generics",
  description: "A deep dive into generic types",
  body: "Generics are one of the most powerful features of TypeScript...",
  authorId: bob.get<string>("id"),
})

const article4 = await Article.insert({
  slug: "getting-started-with-bun",
  title: "Getting Started with Bun",
  description: "A modern JavaScript runtime",
  body: "Bun is a fast, all-in-one JavaScript runtime...",
  authorId: jake.get<string>("id"),
})

console.log(`Articles: ${article1.get("title")}, ${article2.get("title")}, ...`)

// ---------------------------------------------------------------------------
// Article-Tag pivot
// ---------------------------------------------------------------------------

const a1Id = article1.get<string>("id")
const a2Id = article2.get<string>("id")
const a3Id = article3.get<string>("id")
const a4Id = article4.get<string>("id")

await ArticleTag.insertMany([
  { articleId: a1Id, tagId: tagReact.get<string>("id") },
  { articleId: a1Id, tagId: tagAngular.get<string>("id") },
  { articleId: a1Id, tagId: tagDragons.get<string>("id") },
  { articleId: a1Id, tagId: tagTraining.get<string>("id") },
  { articleId: a2Id, tagId: tagReact.get<string>("id") },
  { articleId: a3Id, tagId: tagAngular.get<string>("id") },
  { articleId: a4Id, tagId: tagReact.get<string>("id") },
])

console.log("Article-tag pivot rows inserted")

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

await Comment.insert({
  articleId: a1Id,
  authorId: alice.get<string>("id"),
  body: "Great article! I learned a lot.",
})

await Comment.insert({
  articleId: a1Id,
  authorId: bob.get<string>("id"),
  body: "Nice work! I've been using this technique for years.",
})

await Comment.insert({
  articleId: a2Id,
  authorId: jake.get<string>("id"),
  body: "Well written! Thanks for sharing.",
})

console.log("Comments inserted")

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

await Favorite.insert({ userId: alice.get<string>("id"), articleId: a1Id })
await Favorite.insert({ userId: bob.get<string>("id"), articleId: a1Id })
await Favorite.insert({ userId: jake.get<string>("id"), articleId: a2Id })

console.log("Favorites inserted")

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

console.log("\nSeed complete! Run with: bun run src/index.ts")
await orm.destroy()
