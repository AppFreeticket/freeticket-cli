import { Chalk } from "chalk";

const YELLOW = "#FFD500";

// El banner es decorativo (solo aparece sin comando o con --help), así que
// forzamos truecolor para que SIEMPRE salga amarillo, incluso si chalk no
// detecta soporte de color en la terminal.
const c = new Chalk({ level: 3 });

// ASCII art mostrado al ejecutar `ft` sin comando (o con --help).
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
      c.hex(YELLOW)(" — eventos, tickets y ventas desde tu terminal"),
    "",
  ].join("\n");
}
