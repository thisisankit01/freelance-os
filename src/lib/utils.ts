import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const greetingMessageAccordingToTimeZone = (setGreeting: (value: string) => void) => {
  const timeNow = new Date().getHours();
  if (timeNow < 12) {
    setGreeting("Good Morning 👋");
  } else if (timeNow < 18) {
    setGreeting("Good Afternoon ☀️");
  } else {
    setGreeting("Good Evening 🌙");
  }
}