// pages/admin/manage-layout-v2.js
//
// "Manage Layout" — the floor-plan editor (areas + tables CRUD). It's the same
// component as /admin/tables-v2, which derives its mode from the route: this
// path renders the manage view, /admin/tables-v2 renders the live view. Kept as
// a separate page (instead of an in-page toggle) so it gets its own nav entry.
// getLayout is carried over from the re-exported component.
export { default } from './tables-v2';
