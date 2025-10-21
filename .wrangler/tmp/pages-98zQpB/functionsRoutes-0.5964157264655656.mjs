import { onRequestPost as __routines__id__complete_js_onRequestPost } from "/Users/luke/Documents/03 DEV/Github/frequency127/functions/routines/[id]/complete.js"
import { onRequestDelete as __routines__id__index_js_onRequestDelete } from "/Users/luke/Documents/03 DEV/Github/frequency127/functions/routines/[id]/index.js"
import { onRequestGet as __routines__id__index_js_onRequestGet } from "/Users/luke/Documents/03 DEV/Github/frequency127/functions/routines/[id]/index.js"
import { onRequestPatch as __routines__id__index_js_onRequestPatch } from "/Users/luke/Documents/03 DEV/Github/frequency127/functions/routines/[id]/index.js"
import { onRequestPost as __auth_login_js_onRequestPost } from "/Users/luke/Documents/03 DEV/Github/frequency127/functions/auth-login.js"
import { onRequestPost as __auth_logout_js_onRequestPost } from "/Users/luke/Documents/03 DEV/Github/frequency127/functions/auth-logout.js"
import { onRequestPost as __auth_signup_js_onRequestPost } from "/Users/luke/Documents/03 DEV/Github/frequency127/functions/auth-signup.js"
import { onRequestGet as __me_js_onRequestGet } from "/Users/luke/Documents/03 DEV/Github/frequency127/functions/me.js"
import { onRequestGet as __routines_index_js_onRequestGet } from "/Users/luke/Documents/03 DEV/Github/frequency127/functions/routines/index.js"
import { onRequestPost as __routines_index_js_onRequestPost } from "/Users/luke/Documents/03 DEV/Github/frequency127/functions/routines/index.js"
import { onRequestPost as __share_js_onRequestPost } from "/Users/luke/Documents/03 DEV/Github/frequency127/functions/share.js"
import { onRequestGet as __users_recent_js_onRequestGet } from "/Users/luke/Documents/03 DEV/Github/frequency127/functions/users-recent.js"

export const routes = [
    {
      routePath: "/routines/:id/complete",
      mountPath: "/routines/:id",
      method: "POST",
      middlewares: [],
      modules: [__routines__id__complete_js_onRequestPost],
    },
  {
      routePath: "/routines/:id",
      mountPath: "/routines/:id",
      method: "DELETE",
      middlewares: [],
      modules: [__routines__id__index_js_onRequestDelete],
    },
  {
      routePath: "/routines/:id",
      mountPath: "/routines/:id",
      method: "GET",
      middlewares: [],
      modules: [__routines__id__index_js_onRequestGet],
    },
  {
      routePath: "/routines/:id",
      mountPath: "/routines/:id",
      method: "PATCH",
      middlewares: [],
      modules: [__routines__id__index_js_onRequestPatch],
    },
  {
      routePath: "/auth-login",
      mountPath: "/",
      method: "POST",
      middlewares: [],
      modules: [__auth_login_js_onRequestPost],
    },
  {
      routePath: "/auth-logout",
      mountPath: "/",
      method: "POST",
      middlewares: [],
      modules: [__auth_logout_js_onRequestPost],
    },
  {
      routePath: "/auth-signup",
      mountPath: "/",
      method: "POST",
      middlewares: [],
      modules: [__auth_signup_js_onRequestPost],
    },
  {
      routePath: "/me",
      mountPath: "/",
      method: "GET",
      middlewares: [],
      modules: [__me_js_onRequestGet],
    },
  {
      routePath: "/routines",
      mountPath: "/routines",
      method: "GET",
      middlewares: [],
      modules: [__routines_index_js_onRequestGet],
    },
  {
      routePath: "/routines",
      mountPath: "/routines",
      method: "POST",
      middlewares: [],
      modules: [__routines_index_js_onRequestPost],
    },
  {
      routePath: "/share",
      mountPath: "/",
      method: "POST",
      middlewares: [],
      modules: [__share_js_onRequestPost],
    },
  {
      routePath: "/users-recent",
      mountPath: "/",
      method: "GET",
      middlewares: [],
      modules: [__users_recent_js_onRequestGet],
    },
  ]