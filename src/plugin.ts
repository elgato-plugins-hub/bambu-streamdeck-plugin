import streamDeck from "@elgato/streamdeck";

import { NozzleTemp } from "./actions/nozzle-temp";
import { BedTemp } from "./actions/bed-temp";
import { ChamberTemp } from "./actions/chamber-temp";
import { PrintProgress } from "./actions/print-progress";
import { PrintTime } from "./actions/print-time";
import { AmsStatus } from "./actions/ams-status";
import { AmsSlot1 } from "./actions/ams-slot-1";
import { AmsSlot2 } from "./actions/ams-slot-2";
import { AmsSlot3 } from "./actions/ams-slot-3";
import { AmsSlot4 } from "./actions/ams-slot-4";
import { AmsExternal } from "./actions/ams-external";
import { FanSpeed } from "./actions/fan-speed";
import { SubtaskInfo } from "./actions/subtask-info";

streamDeck.logger.setLevel("info");

process.on("unhandledRejection", (reason) => {
	streamDeck.logger.error(`unhandledRejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`);
});
process.on("uncaughtException", (err) => {
	streamDeck.logger.error(`uncaughtException: ${err.stack ?? err.message}`);
});

streamDeck.actions.registerAction(new PrintProgress());
streamDeck.actions.registerAction(new NozzleTemp());
streamDeck.actions.registerAction(new BedTemp());
streamDeck.actions.registerAction(new ChamberTemp());
streamDeck.actions.registerAction(new AmsStatus());
streamDeck.actions.registerAction(new AmsSlot1());
streamDeck.actions.registerAction(new AmsSlot2());
streamDeck.actions.registerAction(new AmsSlot3());
streamDeck.actions.registerAction(new AmsSlot4());
streamDeck.actions.registerAction(new AmsExternal());
streamDeck.actions.registerAction(new FanSpeed());
streamDeck.actions.registerAction(new SubtaskInfo());
streamDeck.actions.registerAction(new PrintTime());

streamDeck.connect();
