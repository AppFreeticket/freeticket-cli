import { Chalk } from "chalk";

const YELLOW = "#FFD500";

// The banner is decorative (only shown without a command or with --help), so
// force truecolor to keep it yellow even when chalk does not detect terminal
// color support.
const c = new Chalk({ level: 3 });

// ASCII art shown when running `ft` without a command (or with --help).
const ART = String.raw`
  ___ ___ ___ ___ _____ ___ ___ _  _____ _____
 | __| _ \ __| __|_   _|_ _/ __| |/ / __|_   _|
 | _||   / _|| _|  | |  | | (__| ' <| _|  | |
 |_| |_|_\___|___| |_| |___\___|_|\_\___| |_|
`;

export function banner(): string {
  return [
    c.hex(YELLOW)(ART),
    c.hex(YELLOW)("  ● ") +
      c.hex(YELLOW).bold("FreeTicket") +
      c.hex(YELLOW)(" — events, tickets, and sales from your terminal"),
    "",
  ].join("\n");
}
