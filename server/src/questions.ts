export type Question = {
  id: string;
  text: string;
  choices: { id: string; text: string }[];
  correctChoiceId: string;
};

export const SAMPLE_QUESTIONS: Question[] = [
  {
    id: "q1",
    text: "Which planet is known as the Red Planet?",
    choices: [
      { id: "a", text: "Mars" },
      { id: "b", text: "Venus" },
      { id: "c", text: "Jupiter" },
      { id: "d", text: "Mercury" }
    ],
    correctChoiceId: "a"
  },
  {
    id: "q2",
    text: "In computing, what does CPU stand for?",
    choices: [
      { id: "a", text: "Central Processing Unit" },
      { id: "b", text: "Core Power Utility" },
      { id: "c", text: "Compute Performance Unit" },
      { id: "d", text: "Control Program User" }
    ],
    correctChoiceId: "a"
  },
  {
    id: "q3",
    text: "What is the capital of Japan?",
    choices: [
      { id: "a", text: "Kyoto" },
      { id: "b", text: "Tokyo" },
      { id: "c", text: "Osaka" },
      { id: "d", text: "Sapporo" }
    ],
    correctChoiceId: "b"
  }
];
