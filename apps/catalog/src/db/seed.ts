import { hashPassword } from "peta-auth"
import { Author, Book, BookCategory, Category, getORM, Review, User } from "./schema.js"

const orm = await getORM()

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
const admin = await User.insert({
  email: "admin@catalog.dev",
  passwordHash: await hashPassword("admin123"),
  name: "Admin",
  role: "admin",
})

const alice = await User.insert({
  email: "alice@example.com",
  passwordHash: await hashPassword("alice123"),
  name: "Alice Reader",
  role: "author",
})

const bob = await User.insert({
  email: "bob@example.com",
  passwordHash: await hashPassword("bob123"),
  name: "Bob Reviewer",
  role: "user",
})

console.log(`Users: ${admin.get("name")}, ${alice.get("name")}, ${bob.get("name")}`)

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------
const orwell = await Author.insert({ name: "George Orwell", bio: "English novelist and essayist" })
const lee = await Author.insert({ name: "Harper Lee", bio: "American novelist" })
const tolkien = await Author.insert({
  name: "J.R.R. Tolkien",
  bio: "English writer, poet, and philologist",
})
const rowling = await Author.insert({
  name: "J.K. Rowling",
  bio: "British author and philanthropist",
})
const sagan = await Author.insert({
  name: "Carl Sagan",
  bio: "American astronomer and science communicator",
})
const weir = await Author.insert({ name: "Andy Weir", bio: "American novelist" })
const aliceAuthor = await Author.insert({
  name: "Alice Reader",
  bio: "A catalog user who writes their own books",
  userId: alice.get("id"),
})

console.log(`Authors: ${orwell.get("name")}, ${lee.get("name")}, ${tolkien.get("name")}, ...`)

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
const fiction = await Category.insert({ name: "Fiction", description: "Fictional literature" })
const scifi = await Category.insert({
  name: "Science Fiction",
  description: "Speculative fiction exploring scientific themes",
})
const fantasy = await Category.insert({ name: "Fantasy", description: "Fantasy literature" })
const classic = await Category.insert({ name: "Classic", description: "Timeless literary works" })
const science = await Category.insert({
  name: "Science",
  description: "Scientific and popular science books",
})

console.log(`Categories: ${fiction.get("name")}, ${scifi.get("name")}, ${fantasy.get("name")}, ...`)

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------
const book1984 = await Book.insert({
  title: "1984",
  isbn: "9780451524935",
  description: "A dystopian social science fiction novel",
  publishedYear: 1949,
  price: 9.99,
  authorId: orwell.get("id"),
  inStock: true,
})

const animalFarm = await Book.insert({
  title: "Animal Farm",
  isbn: "9780451526342",
  description: "A satirical allegorical novella",
  publishedYear: 1945,
  price: 7.99,
  authorId: orwell.get("id"),
  inStock: true,
})

const mockingbird = await Book.insert({
  title: "To Kill a Mockingbird",
  isbn: "9780061120084",
  description: "A novel about racial injustice in the Deep South",
  publishedYear: 1960,
  price: 11.99,
  authorId: lee.get("id"),
  inStock: true,
})

const lotr = await Book.insert({
  title: "The Lord of the Rings",
  isbn: "9780544003415",
  description: "An epic high-fantasy novel",
  publishedYear: 1954,
  price: 19.99,
  authorId: tolkien.get("id"),
  inStock: true,
})

const hobbit = await Book.insert({
  title: "The Hobbit",
  isbn: "9780547928227",
  description: "A children's fantasy novel",
  publishedYear: 1937,
  price: 10.99,
  authorId: tolkien.get("id"),
  inStock: false,
})

const cosmos = await Book.insert({
  title: "Cosmos",
  isbn: "9780345539434",
  description: "A journey through the universe",
  publishedYear: 1980,
  price: 14.99,
  authorId: sagan.get("id"),
  inStock: true,
})

const martian = await Book.insert({
  title: "The Martian",
  isbn: "9780553418026",
  description: "An astronaut's struggle to survive on Mars",
  publishedYear: 2011,
  price: 9.99,
  authorId: weir.get("id"),
  inStock: true,
})

const hp1 = await Book.insert({
  title: "Harry Potter and the Sorcerer's Stone",
  isbn: "9780590353427",
  description: "A young wizard discovers his magical heritage",
  publishedYear: 1997,
  price: 12.99,
  authorId: rowling.get("id"),
  inStock: true,
})

const hp2 = await Book.insert({
  title: "Harry Potter and the Chamber of Secrets",
  isbn: "9780439064866",
  description: "Harry's second year at Hogwarts",
  publishedYear: 1998,
  price: 12.99,
  authorId: rowling.get("id"),
  inStock: true,
})

const hp3 = await Book.insert({
  title: "Harry Potter and the Prisoner of Azkaban",
  isbn: "9780439136358",
  description: "Harry's third year at Hogwarts",
  publishedYear: 1999,
  price: 13.99,
  authorId: rowling.get("id"),
  inStock: true,
})

// Alice's own book (authored under her linked author profile)
const _aliceBook = await Book.insert({
  title: "My First Catalog Book",
  isbn: "9781234567890",
  description: "A book written by Alice, who is both a user and an author.",
  publishedYear: 2026,
  price: 4.99,
  authorId: aliceAuthor.get("id"),
  inStock: true,
})

console.log(`Books: ${book1984.get("title")}, ${lotr.get("title")}, ${martian.get("title")}, ...`)

// ---------------------------------------------------------------------------
// Book-Category pivot relationships
// ---------------------------------------------------------------------------
await BookCategory.insertMany([
  { bookId: book1984.get("id"), categoryId: fiction.get("id") },
  { bookId: book1984.get("id"), categoryId: classic.get("id") },
  { bookId: book1984.get("id"), categoryId: scifi.get("id") },
  { bookId: animalFarm.get("id"), categoryId: fiction.get("id") },
  { bookId: animalFarm.get("id"), categoryId: classic.get("id") },
  { bookId: mockingbird.get("id"), categoryId: fiction.get("id") },
  { bookId: mockingbird.get("id"), categoryId: classic.get("id") },
  { bookId: lotr.get("id"), categoryId: fantasy.get("id") },
  { bookId: lotr.get("id"), categoryId: classic.get("id") },
  { bookId: hobbit.get("id"), categoryId: fantasy.get("id") },
  { bookId: hobbit.get("id"), categoryId: classic.get("id") },
  { bookId: cosmos.get("id"), categoryId: science.get("id") },
  { bookId: cosmos.get("id"), categoryId: classic.get("id") },
  { bookId: martian.get("id"), categoryId: scifi.get("id") },
  { bookId: hp1.get("id"), categoryId: fantasy.get("id") },
  { bookId: hp2.get("id"), categoryId: fantasy.get("id") },
  { bookId: hp3.get("id"), categoryId: fantasy.get("id") },
])

console.log("Book-category pivot rows inserted")

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------
await Review.insert({
  bookId: book1984.get("id"),
  userId: alice.get("id"),
  rating: 5,
  body: "A masterpiece of dystopian fiction.",
  createdAt: new Date().toISOString(),
})
await Review.insert({
  bookId: book1984.get("id"),
  userId: bob.get("id"),
  rating: 4,
  body: "Thought-provoking and eerily relevant.",
  createdAt: new Date().toISOString(),
})

console.log("Reviews: 2 reviews for 1984")

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------
console.log("\nSeed complete! Run with: bun run src/index.ts")
await orm.destroy()
