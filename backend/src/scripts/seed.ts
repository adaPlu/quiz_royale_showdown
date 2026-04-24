/**
 * Database seed script.
 *
 * Run with:  npm run seed -w backend
 *
 * Seeds:
 *  - Power-up definitions (5 types)
 *  - Cosmetic items (starter set)
 *  - Sample questions from Open Trivia DB categories
 *  - Season 1 (if none exists)
 */

import "dotenv/config";
import { PrismaClient, Difficulty } from "@prisma/client";
import { ulid } from "ulid";

const prisma = new PrismaClient();

// ─── Power-ups ───────────────────────────────────────────────────────────────

const POWER_UPS = [
  {
    code: "DOUBLE_DOWN",
    name: "Double Down",
    description: "Double your score for this round if correct.",
    rarity: "COMMON",
    cooldownSecs: 0
  },
  {
    code: "FIFTY_FIFTY",
    name: "50/50",
    description: "Eliminate 2 wrong answers.",
    rarity: "COMMON",
    cooldownSecs: 0
  },
  {
    code: "TIME_FREEZE",
    name: "Time Freeze",
    description: "Pause the countdown for 5 seconds.",
    rarity: "RARE",
    cooldownSecs: 0
  },
  {
    code: "SHIELD",
    name: "Shield",
    description: "Protect yourself from elimination this round.",
    rarity: "RARE",
    cooldownSecs: 0
  },
  {
    code: "SABOTAGE",
    name: "Sabotage",
    description: "Force a target player to skip this question.",
    rarity: "EPIC",
    cooldownSecs: 0
  }
] as const;

// ─── Cosmetics ───────────────────────────────────────────────────────────────

const COSMETICS = [
  {
    code: "AVATAR_DEFAULT",
    type: "AVATAR" as const,
    name: "Default Avatar",
    assetUrl: "https://assets.quizroyale.io/cosmetics/avatar-default.webp",
    rarity: "COMMON"
  },
  {
    code: "FRAME_GOLD",
    type: "FRAME" as const,
    name: "Gold Frame",
    assetUrl: "https://assets.quizroyale.io/cosmetics/frame-gold.webp",
    rarity: "RARE"
  },
  {
    code: "TITLE_CHAMPION",
    type: "TITLE" as const,
    name: "Champion",
    assetUrl: "https://assets.quizroyale.io/cosmetics/title-champion.webp",
    rarity: "EPIC"
  }
] as const;

// ─── Sample questions ─────────────────────────────────────────────────────────

const QUESTIONS: Array<{
  prompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctIndex: number;
  category: string;
  difficulty: Difficulty;
}> = [
  // ── General Trivia: Geography ─────────────────────────────────────────────
  { prompt: "What is the capital of France?", optionA: "Berlin", optionB: "Madrid", optionC: "Paris", optionD: "Rome", correctIndex: 2, category: "Geography", difficulty: Difficulty.EASY },
  { prompt: "What is the largest ocean on Earth?", optionA: "Atlantic", optionB: "Indian", optionC: "Arctic", optionD: "Pacific", correctIndex: 3, category: "Geography", difficulty: Difficulty.EASY },
  { prompt: "Which country has the most natural lakes?", optionA: "Russia", optionB: "USA", optionC: "Canada", optionD: "Brazil", correctIndex: 2, category: "Geography", difficulty: Difficulty.MEDIUM },
  { prompt: "What is the capital of Australia?", optionA: "Sydney", optionB: "Melbourne", optionC: "Brisbane", optionD: "Canberra", correctIndex: 3, category: "Geography", difficulty: Difficulty.MEDIUM },
  { prompt: "Which African country has the largest population?", optionA: "Ethiopia", optionB: "Egypt", optionC: "Nigeria", optionD: "South Africa", correctIndex: 2, category: "Geography", difficulty: Difficulty.MEDIUM },
  { prompt: "Mount Everest is on the border of which two countries?", optionA: "India and Tibet", optionB: "Nepal and Tibet", optionC: "Nepal and India", optionD: "Bhutan and Tibet", correctIndex: 1, category: "Geography", difficulty: Difficulty.HARD },
  { prompt: "What is the smallest country in the world by area?", optionA: "Monaco", optionB: "Nauru", optionC: "San Marino", optionD: "Vatican City", correctIndex: 3, category: "Geography", difficulty: Difficulty.MEDIUM },
  { prompt: "The Amazon River empties into which ocean?", optionA: "Pacific", optionB: "Atlantic", optionC: "Indian", optionD: "Arctic", correctIndex: 1, category: "Geography", difficulty: Difficulty.EASY },

  // ── General Trivia: Science ───────────────────────────────────────────────
  { prompt: "Which planet is known as the Red Planet?", optionA: "Jupiter", optionB: "Venus", optionC: "Saturn", optionD: "Mars", correctIndex: 3, category: "Science", difficulty: Difficulty.EASY },
  { prompt: "What is the chemical symbol for gold?", optionA: "Go", optionB: "Gd", optionC: "Au", optionD: "Ag", correctIndex: 2, category: "Science", difficulty: Difficulty.MEDIUM },
  { prompt: "What is the speed of light in a vacuum (km/s)?", optionA: "150,000", optionB: "200,000", optionC: "299,792", optionD: "340", correctIndex: 2, category: "Science", difficulty: Difficulty.HARD },
  { prompt: "Which element has atomic number 79?", optionA: "Silver", optionB: "Platinum", optionC: "Copper", optionD: "Gold", correctIndex: 3, category: "Science", difficulty: Difficulty.HARD },
  { prompt: "What is the powerhouse of the cell?", optionA: "Nucleus", optionB: "Ribosome", optionC: "Mitochondria", optionD: "Golgi apparatus", correctIndex: 2, category: "Science", difficulty: Difficulty.EASY },
  { prompt: "How many bones are in the adult human body?", optionA: "196", optionB: "206", optionC: "216", optionD: "226", correctIndex: 1, category: "Science", difficulty: Difficulty.MEDIUM },
  { prompt: "What is the most abundant gas in Earth's atmosphere?", optionA: "Oxygen", optionB: "Carbon dioxide", optionC: "Argon", optionD: "Nitrogen", correctIndex: 3, category: "Science", difficulty: Difficulty.EASY },
  { prompt: "What force keeps planets in orbit around the sun?", optionA: "Magnetism", optionB: "Gravity", optionC: "Friction", optionD: "Electrostatics", correctIndex: 1, category: "Science", difficulty: Difficulty.EASY },
  { prompt: "DNA stands for what?", optionA: "Deoxyribonucleic acid", optionB: "Dinitrogen nucleic acid", optionC: "Deoxyribose nitrogen acid", optionD: "Diribonucleic acid", correctIndex: 0, category: "Science", difficulty: Difficulty.MEDIUM },
  { prompt: "Which planet has the most moons?", optionA: "Jupiter", optionB: "Saturn", optionC: "Uranus", optionD: "Neptune", correctIndex: 1, category: "Science", difficulty: Difficulty.HARD },

  // ── General Trivia: History ───────────────────────────────────────────────
  { prompt: "In which year did the Berlin Wall fall?", optionA: "1985", optionB: "1989", optionC: "1991", optionD: "1993", correctIndex: 1, category: "History", difficulty: Difficulty.MEDIUM },
  { prompt: "Who was the first President of the United States?", optionA: "Thomas Jefferson", optionB: "Benjamin Franklin", optionC: "John Adams", optionD: "George Washington", correctIndex: 3, category: "History", difficulty: Difficulty.EASY },
  { prompt: "In what year did World War II end?", optionA: "1943", optionB: "1944", optionC: "1945", optionD: "1946", correctIndex: 2, category: "History", difficulty: Difficulty.EASY },
  { prompt: "Which empire built the Colosseum?", optionA: "Greek", optionB: "Ottoman", optionC: "Roman", optionD: "Byzantine", correctIndex: 2, category: "History", difficulty: Difficulty.EASY },
  { prompt: "What ancient wonder stood in Alexandria, Egypt?", optionA: "The Hanging Gardens", optionB: "The Great Lighthouse", optionC: "The Colossus", optionD: "The Temple of Artemis", correctIndex: 1, category: "History", difficulty: Difficulty.HARD },
  { prompt: "The French Revolution began in which year?", optionA: "1769", optionB: "1776", optionC: "1789", optionD: "1804", correctIndex: 2, category: "History", difficulty: Difficulty.MEDIUM },
  { prompt: "Who was the first human to walk on the Moon?", optionA: "Buzz Aldrin", optionB: "Yuri Gagarin", optionC: "Neil Armstrong", optionD: "John Glenn", correctIndex: 2, category: "History", difficulty: Difficulty.EASY },

  // ── General Trivia: Mathematics ───────────────────────────────────────────
  { prompt: "What is the square root of 144?", optionA: "11", optionB: "12", optionC: "13", optionD: "14", correctIndex: 1, category: "Mathematics", difficulty: Difficulty.EASY },
  { prompt: "What is π (pi) rounded to two decimal places?", optionA: "3.12", optionB: "3.14", optionC: "3.16", optionD: "3.18", correctIndex: 1, category: "Mathematics", difficulty: Difficulty.EASY },
  { prompt: "What is 15% of 200?", optionA: "25", optionB: "30", optionC: "35", optionD: "40", correctIndex: 1, category: "Mathematics", difficulty: Difficulty.EASY },
  { prompt: "If a triangle has angles of 60° and 80°, what is the third angle?", optionA: "30°", optionB: "40°", optionC: "50°", optionD: "60°", correctIndex: 1, category: "Mathematics", difficulty: Difficulty.MEDIUM },
  { prompt: "What is the only even prime number?", optionA: "1", optionB: "2", optionC: "4", optionD: "6", correctIndex: 1, category: "Mathematics", difficulty: Difficulty.EASY },
  { prompt: "What is 2 to the power of 10?", optionA: "512", optionB: "1,024", optionC: "2,048", optionD: "4,096", correctIndex: 1, category: "Mathematics", difficulty: Difficulty.MEDIUM },

  // ── General Trivia: Art & Literature ─────────────────────────────────────
  { prompt: "Who painted the Mona Lisa?", optionA: "Michelangelo", optionB: "Leonardo da Vinci", optionC: "Raphael", optionD: "Botticelli", correctIndex: 1, category: "Art", difficulty: Difficulty.EASY },
  { prompt: "Who wrote 'To Kill a Mockingbird'?", optionA: "Harper Lee", optionB: "J.K. Rowling", optionC: "Ernest Hemingway", optionD: "Mark Twain", correctIndex: 0, category: "Literature", difficulty: Difficulty.MEDIUM },
  { prompt: "Which Shakespeare play features the character Iago?", optionA: "Hamlet", optionB: "Macbeth", optionC: "Othello", optionD: "King Lear", correctIndex: 2, category: "Literature", difficulty: Difficulty.MEDIUM },
  { prompt: "Vincent van Gogh was from which country?", optionA: "Belgium", optionB: "Germany", optionC: "France", optionD: "Netherlands", correctIndex: 3, category: "Art", difficulty: Difficulty.MEDIUM },
  { prompt: "What is the name of Harry Potter's owl?", optionA: "Errol", optionB: "Pigwidgeon", optionC: "Hedwig", optionD: "Crookshanks", correctIndex: 2, category: "Literature", difficulty: Difficulty.EASY },
  { prompt: "Who wrote '1984'?", optionA: "Aldous Huxley", optionB: "George Orwell", optionC: "Ray Bradbury", optionD: "H.G. Wells", correctIndex: 1, category: "Literature", difficulty: Difficulty.MEDIUM },

  // ── General Trivia: Sports ────────────────────────────────────────────────
  { prompt: "How many players are on a standard soccer team on the field?", optionA: "9", optionB: "10", optionC: "11", optionD: "12", correctIndex: 2, category: "Sports", difficulty: Difficulty.EASY },
  { prompt: "In which sport would you perform a slam dunk?", optionA: "Volleyball", optionB: "Basketball", optionC: "Tennis", optionD: "Baseball", correctIndex: 1, category: "Sports", difficulty: Difficulty.EASY },
  { prompt: "How many holes are played in a standard round of golf?", optionA: "9", optionB: "12", optionC: "16", optionD: "18", correctIndex: 3, category: "Sports", difficulty: Difficulty.EASY },
  { prompt: "Which country has won the most FIFA World Cup titles?", optionA: "Germany", optionB: "Argentina", optionC: "Brazil", optionD: "France", correctIndex: 2, category: "Sports", difficulty: Difficulty.MEDIUM },
  { prompt: "How long is an Olympic swimming pool in meters?", optionA: "25", optionB: "50", optionC: "75", optionD: "100", correctIndex: 1, category: "Sports", difficulty: Difficulty.MEDIUM },

  // ── General Trivia: Music ─────────────────────────────────────────────────
  { prompt: "How many strings does a standard guitar have?", optionA: "4", optionB: "5", optionC: "6", optionD: "7", correctIndex: 2, category: "Music", difficulty: Difficulty.EASY },
  { prompt: "Which band performed 'Bohemian Rhapsody'?", optionA: "The Beatles", optionB: "Led Zeppelin", optionC: "Queen", optionD: "The Rolling Stones", correctIndex: 2, category: "Music", difficulty: Difficulty.EASY },
  { prompt: "Which instrument has 88 keys?", optionA: "Organ", optionB: "Harpsichord", optionC: "Piano", optionD: "Synthesizer", correctIndex: 2, category: "Music", difficulty: Difficulty.EASY },
  { prompt: "What genre did Tupac Shakur perform?", optionA: "R&B", optionB: "Hip-Hop", optionC: "Reggae", optionD: "Gospel", correctIndex: 1, category: "Music", difficulty: Difficulty.EASY },

  // ── General Trivia: Food & Pop Culture ───────────────────────────────────
  { prompt: "What is the main ingredient in guacamole?", optionA: "Tomato", optionB: "Onion", optionC: "Jalapeño", optionD: "Avocado", correctIndex: 3, category: "Food", difficulty: Difficulty.EASY },
  { prompt: "Which country is sushi originally from?", optionA: "China", optionB: "Korea", optionC: "Japan", optionD: "Vietnam", correctIndex: 2, category: "Food", difficulty: Difficulty.EASY },
  { prompt: "What does 'GIF' stand for?", optionA: "Graphics Interchange Format", optionB: "General Image File", optionC: "Global Image Format", optionD: "Graphics Internet File", correctIndex: 0, category: "Technology", difficulty: Difficulty.MEDIUM },

  // ── Modern Trivia: Tech & AI ──────────────────────────────────────────────
  { prompt: "Which company developed ChatGPT?", optionA: "Google", optionB: "Meta", optionC: "OpenAI", optionD: "Microsoft", correctIndex: 2, category: "Technology", difficulty: Difficulty.EASY },
  { prompt: "What does 'GPU' stand for?", optionA: "General Processing Unit", optionB: "Graphics Processing Unit", optionC: "Global Performance Unit", optionD: "Graphical Program Utility", correctIndex: 1, category: "Technology", difficulty: Difficulty.MEDIUM },
  { prompt: "Which company makes the iPhone?", optionA: "Samsung", optionB: "Google", optionC: "Apple", optionD: "Sony", correctIndex: 2, category: "Technology", difficulty: Difficulty.EASY },
  { prompt: "What programming language is primarily used for AI/ML research?", optionA: "Java", optionB: "C++", optionC: "Python", optionD: "Ruby", correctIndex: 2, category: "Technology", difficulty: Difficulty.EASY },
  { prompt: "What does 'API' stand for in software development?", optionA: "Application Programming Interface", optionB: "Automated Program Integration", optionC: "Application Process Interaction", optionD: "Advanced Programming Index", correctIndex: 0, category: "Technology", difficulty: Difficulty.MEDIUM },
  { prompt: "Which streaming platform released the show 'Stranger Things'?", optionA: "Hulu", optionB: "Disney+", optionC: "Amazon Prime", optionD: "Netflix", correctIndex: 3, category: "Entertainment", difficulty: Difficulty.EASY },
  { prompt: "What social media platform is known for short-form videos and the 'For You' page?", optionA: "Instagram", optionB: "Snapchat", optionC: "TikTok", optionD: "YouTube Shorts", correctIndex: 2, category: "Technology", difficulty: Difficulty.EASY },
  { prompt: "What is the name of Elon Musk's space exploration company?", optionA: "Blue Origin", optionB: "Virgin Galactic", optionC: "SpaceX", optionD: "Rocket Lab", correctIndex: 2, category: "Technology", difficulty: Difficulty.EASY },
  { prompt: "Which company owns Instagram and WhatsApp?", optionA: "Alphabet", optionB: "Meta", optionC: "Twitter", optionD: "Snap Inc.", correctIndex: 1, category: "Technology", difficulty: Difficulty.EASY },
  { prompt: "What cryptocurrency was created by Satoshi Nakamoto?", optionA: "Ethereum", optionB: "Litecoin", optionC: "Bitcoin", optionD: "Dogecoin", correctIndex: 2, category: "Technology", difficulty: Difficulty.MEDIUM },

  // ── Modern Trivia: Movies & TV ────────────────────────────────────────────
  { prompt: "Which film won the Academy Award for Best Picture in 2022?", optionA: "The Power of the Dog", optionB: "Belfast", optionC: "CODA", optionD: "Dune", correctIndex: 2, category: "Entertainment", difficulty: Difficulty.HARD },
  { prompt: "In the MCU, who wields the hammer Mjolnir?", optionA: "Iron Man", optionB: "Captain America", optionC: "Thor", optionD: "Hulk", correctIndex: 2, category: "Entertainment", difficulty: Difficulty.EASY },
  { prompt: "Which animated film features the song 'Let It Go'?", optionA: "Moana", optionB: "Tangled", optionC: "Brave", optionD: "Frozen", correctIndex: 3, category: "Entertainment", difficulty: Difficulty.EASY },
  { prompt: "Which TV show features a chemistry teacher who becomes a drug kingpin?", optionA: "Ozark", optionB: "Breaking Bad", optionC: "Dexter", optionD: "The Wire", correctIndex: 1, category: "Entertainment", difficulty: Difficulty.EASY },
  { prompt: "What is the highest-grossing film of all time (worldwide)?", optionA: "Avengers: Endgame", optionB: "Titanic", optionC: "Avatar", optionD: "Star Wars: The Force Awakens", correctIndex: 2, category: "Entertainment", difficulty: Difficulty.MEDIUM },
  { prompt: "Who plays Tony Stark / Iron Man in the MCU?", optionA: "Chris Evans", optionB: "Chris Hemsworth", optionC: "Mark Ruffalo", optionD: "Robert Downey Jr.", correctIndex: 3, category: "Entertainment", difficulty: Difficulty.EASY },
  { prompt: "Which Netflix series is set in a fictional Korean survival competition?", optionA: "All of Us Are Dead", optionB: "Squid Game", optionC: "Sweet Home", optionD: "Kingdom", correctIndex: 1, category: "Entertainment", difficulty: Difficulty.EASY },

  // ── Modern Trivia: Music ──────────────────────────────────────────────────
  { prompt: "Which artist released the album 'Renaissance' in 2022?", optionA: "Rihanna", optionB: "Lizzo", optionC: "Beyoncé", optionD: "Adele", correctIndex: 2, category: "Music", difficulty: Difficulty.MEDIUM },
  { prompt: "Which rapper's real name is Aubrey Drake Graham?", optionA: "Kendrick Lamar", optionB: "Drake", optionC: "J. Cole", optionD: "Travis Scott", correctIndex: 1, category: "Music", difficulty: Difficulty.EASY },
  { prompt: "Taylor Swift's 'Eras Tour' began in which year?", optionA: "2022", optionB: "2023", optionC: "2024", optionD: "2021", correctIndex: 1, category: "Music", difficulty: Difficulty.MEDIUM },
  { prompt: "Which Puerto Rican artist sings 'Despacito'?", optionA: "Bad Bunny", optionB: "J Balvin", optionC: "Maluma", optionD: "Luis Fonsi", correctIndex: 3, category: "Music", difficulty: Difficulty.MEDIUM },
  { prompt: "What genre is the artist Bad Bunny primarily known for?", optionA: "Reggae", optionB: "Salsa", optionC: "Reggaeton/Latin Trap", optionD: "Cumbia", correctIndex: 2, category: "Music", difficulty: Difficulty.EASY },

  // ── Modern Trivia: Sports ─────────────────────────────────────────────────
  { prompt: "Who won the 2023 FIFA Women's World Cup?", optionA: "USA", optionB: "England", optionC: "Australia", optionD: "Spain", correctIndex: 3, category: "Sports", difficulty: Difficulty.HARD },
  { prompt: "LeBron James plays for which NBA team as of 2024?", optionA: "Miami Heat", optionB: "Cleveland Cavaliers", optionC: "LA Lakers", optionD: "Chicago Bulls", correctIndex: 2, category: "Sports", difficulty: Difficulty.EASY },
  { prompt: "Which country hosted the 2022 FIFA World Cup?", optionA: "UAE", optionB: "Saudi Arabia", optionC: "Bahrain", optionD: "Qatar", correctIndex: 3, category: "Sports", difficulty: Difficulty.EASY },
  { prompt: "Who holds the record for most Grand Slam singles titles in tennis (men's) as of 2024?", optionA: "Rafael Nadal", optionB: "Novak Djokovic", optionC: "Roger Federer", optionD: "Carlos Alcaraz", correctIndex: 1, category: "Sports", difficulty: Difficulty.MEDIUM },
  { prompt: "In which sport did Simone Biles become a multi-time World and Olympic champion?", optionA: "Swimming", optionB: "Track and Field", optionC: "Gymnastics", optionD: "Diving", correctIndex: 2, category: "Sports", difficulty: Difficulty.EASY },

  // ── Modern Trivia: Current Events & Trends ────────────────────────────────
  { prompt: "What does 'NFT' stand for?", optionA: "New Financial Token", optionB: "Non-Fungible Token", optionC: "Network File Transfer", optionD: "Numeric Financial Transaction", correctIndex: 1, category: "Technology", difficulty: Difficulty.MEDIUM },
  { prompt: "Which app went viral in 2023 for AI-generated profile pictures?", optionA: "FaceApp", optionB: "Lensa AI", optionC: "Prisma", optionD: "Remini", correctIndex: 1, category: "Technology", difficulty: Difficulty.HARD },
  { prompt: "What term describes AI that can generate text, images, and code from prompts?", optionA: "Predictive AI", optionB: "Reactive AI", optionC: "Generative AI", optionD: "Symbolic AI", correctIndex: 2, category: "Technology", difficulty: Difficulty.MEDIUM },
  { prompt: "Which social media platform rebranded to 'X' in 2023?", optionA: "Facebook", optionB: "Snapchat", optionC: "Twitter", optionD: "LinkedIn", correctIndex: 2, category: "Technology", difficulty: Difficulty.EASY },
  { prompt: "What is the name of Apple's mixed reality headset released in 2024?", optionA: "Apple Reality", optionB: "Apple Vision Pro", optionC: "Apple Lens", optionD: "Apple XR", correctIndex: 1, category: "Technology", difficulty: Difficulty.MEDIUM },
  { prompt: "Which AI model family is developed by Anthropic?", optionA: "GPT", optionB: "Gemini", optionC: "Llama", optionD: "Claude", correctIndex: 3, category: "Technology", difficulty: Difficulty.MEDIUM },
  { prompt: "The term 'rizz' became popular slang meaning what?", optionA: "Style or fashion", optionB: "Charisma or charm", optionC: "Musical talent", optionD: "Athletic skill", correctIndex: 1, category: "Pop Culture", difficulty: Difficulty.EASY },
  { prompt: "What is 'vibe coding'?", optionA: "Writing code while listening to music", optionB: "Using AI to generate code from natural language prompts", optionC: "A new JavaScript framework", optionD: "Pair programming over video call", correctIndex: 1, category: "Technology", difficulty: Difficulty.MEDIUM },
  { prompt: "Which video game became a cultural phenomenon with 100-player battle royale gameplay in 2017?", optionA: "Apex Legends", optionB: "Warzone", optionC: "PUBG/PlayerUnknown's Battlegrounds", optionD: "Fortnite", correctIndex: 3, category: "Gaming", difficulty: Difficulty.EASY },
  { prompt: "What is the name of OpenAI's most capable model series (as of 2024)?", optionA: "Gemini", optionB: "GPT-4", optionC: "Claude 3", optionD: "Llama 3", correctIndex: 1, category: "Technology", difficulty: Difficulty.MEDIUM },
  { prompt: "Which streaming platform launched in November 2019 with 'The Mandalorian'?", optionA: "Peacock", optionB: "Paramount+", optionC: "HBO Max", optionD: "Disney+", correctIndex: 3, category: "Entertainment", difficulty: Difficulty.EASY },
  { prompt: "What is 'FOMO' an acronym for?", optionA: "Fear Of Missing Out", optionB: "Feeling Of Major Opportunity", optionC: "Focus On More Options", optionD: "Future Of Media Online", correctIndex: 0, category: "Pop Culture", difficulty: Difficulty.EASY },
  { prompt: "Which game popularized the 'battle royale' genre and is free-to-play with V-Bucks currency?", optionA: "Apex Legends", optionB: "Warzone", optionC: "Fortnite", optionD: "PUBG", correctIndex: 2, category: "Gaming", difficulty: Difficulty.EASY },
  { prompt: "SpaceX's massive rocket/spacecraft system is named what?", optionA: "Falcon Heavy", optionB: "New Shepard", optionC: "Starship", optionD: "Crew Dragon", correctIndex: 2, category: "Technology", difficulty: Difficulty.MEDIUM },
];

// ─── Auto-seed (called on startup) ───────────────────────────────────────────

export async function autoSeedIfEmpty(): Promise<void> {
  const count = await prisma.questionBank.count();
  if (count > 0) return;
  console.log("Question bank is empty — running seed…");
  await main();
}

// ─── Main seed ────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding database…");

  // Power-ups (upsert by code)
  for (const pu of POWER_UPS) {
    await prisma.powerUp.upsert({
      where: { code: pu.code },
      update: {},
      create: {
        id: ulid(),
        ...pu,
        isActive: true
      }
    });
  }
  console.log(`  ✓ ${POWER_UPS.length} power-ups seeded`);

  // Cosmetics
  for (const cosmetic of COSMETICS) {
    await prisma.cosmetic.upsert({
      where: { code: cosmetic.code },
      update: {},
      create: {
        id: ulid(),
        ...cosmetic
      }
    });
  }
  console.log(`  ✓ ${COSMETICS.length} cosmetics seeded`);

  // Questions
  for (const q of QUESTIONS) {
    const existing = await prisma.questionBank.findFirst({
      where: { prompt: q.prompt }
    });
    if (!existing) {
      await prisma.questionBank.create({
        data: { id: ulid(), ...q, isActive: true }
      });
    }
  }
  console.log(`  ✓ ${QUESTIONS.length} questions seeded`);

  // Season 1
  const season1Slug = "season-1";
  await prisma.season.upsert({
    where: { slug: season1Slug },
    update: {},
    create: {
      id: ulid(),
      slug: season1Slug,
      name: "Season 1: Royale Beginnings",
      startsAt: new Date("2026-05-01T00:00:00Z"),
      endsAt: new Date("2026-07-31T23:59:59Z")
    }
  });
  console.log("  ✓ Season 1 seeded");

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
