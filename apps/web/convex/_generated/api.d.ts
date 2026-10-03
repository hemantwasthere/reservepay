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
import type * as merchantImages from "../merchantImages.js";
import type * as merchants from "../merchants.js";
import type * as paymentActions from "../paymentActions.js";
import type * as paymentValidators from "../paymentValidators.js";
import type * as payments from "../payments.js";
import type * as session from "../session.js";
import type * as signInNonce from "../signInNonce.js";

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
  merchantImages: typeof merchantImages;
  merchants: typeof merchants;
  paymentActions: typeof paymentActions;
  paymentValidators: typeof paymentValidators;
  payments: typeof payments;
  session: typeof session;
  signInNonce: typeof signInNonce;
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
