/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authActions from "../authActions.js";
import type * as crons from "../crons.js";
import type * as demoOrders from "../demoOrders.js";
import type * as keeper from "../keeper.js";
import type * as keeperActions from "../keeperActions.js";
import type * as merchantImages from "../merchantImages.js";
import type * as merchants from "../merchants.js";
import type * as paymentActions from "../paymentActions.js";
import type * as paymentValidators from "../paymentValidators.js";
import type * as payments from "../payments.js";
import type * as reconcile from "../reconcile.js";
import type * as reconcileActions from "../reconcileActions.js";
import type * as rpc from "../rpc.js";
import type * as session from "../session.js";
import type * as signInNonce from "../signInNonce.js";
import type * as syncLink from "../syncLink.js";
import type * as trackWorker from "../trackWorker.js";
import type * as workerValidators from "../workerValidators.js";
import type * as workers from "../workers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authActions: typeof authActions;
  crons: typeof crons;
  demoOrders: typeof demoOrders;
  keeper: typeof keeper;
  keeperActions: typeof keeperActions;
  merchantImages: typeof merchantImages;
  merchants: typeof merchants;
  paymentActions: typeof paymentActions;
  paymentValidators: typeof paymentValidators;
  payments: typeof payments;
  reconcile: typeof reconcile;
  reconcileActions: typeof reconcileActions;
  rpc: typeof rpc;
  session: typeof session;
  signInNonce: typeof signInNonce;
  syncLink: typeof syncLink;
  trackWorker: typeof trackWorker;
  workerValidators: typeof workerValidators;
  workers: typeof workers;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
