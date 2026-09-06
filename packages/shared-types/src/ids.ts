import { z } from 'zod';

/**
 * All identifiers are opaque strings. The simulation never parses meaning out of
 * an id; ids exist so that state can reference other state deterministically.
 */
export const IdSchema = z.string().min(1).max(64);

export type LifeId = string;
export type CharacterId = string;
export type NpcId = string;
export type EventDefinitionId = string;
export type EventInstanceId = string;
export type BusinessId = string;
export type AssetId = string;
export type JobId = string;
export type LocationId = string;
