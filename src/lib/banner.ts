import chalk from "chalk";

const YELLOW = "#FFD500";
const TEAL = "#07C2BA";

// ASCII art mostrado al ejecutar `ft` sin comando (o con --help).
const ART = String.raw`
  ___ ___ ___ ___ _____ ___ ___ _  _____ _____
 | __| _ \ __| __|_   _|_ _/ __| |/ / __|_   _|
 | _||   / _|| _|  | |  | | (__| ' <| _|  | |
 |_| |_|_\___|___| |_| |___\___|_|\_\___| |_|
`;

export function banner(): string {
  return [
    chalk.hex(YELLOW)(ART),
    `  ${chalk.hex(TEAL)("●")} CLI oficial de ${chalk.hex(YELLOW).bold("FreeTicket")} ${chalk.dim("— eventos, tickets y ventas desde tu terminal")}`,
    "",
  ].join("\n");
}
