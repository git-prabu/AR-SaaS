/* public/staff-v2/data.js
 *
 * Firebase + Firestore + auth + live-data layer for the static
 * staff-v2 prototype. Loaded BEFORE the Babel-compiled React
 * scripts so window.ZONES, window.TABLES, window.MENU, window.CATEGORIES,
 * window.SEED_TICKETS exist by the time app.jsx mounts.
 *
 * Public env values are hardcoded here — Firebase web API keys are
 * designed to be public (security is enforced by Firestore rules
 * not by hiding the key). Vercel's NEXT_PUBLIC_* env vars are
 * already visible to anyone inspecting the main bundle.
 *
 * Exposes:
 *   window.SV2 = {
 *     ready: false,
 *     session: { staffId, name, restaurantId, restaurantName, role, ... },
 *     subscribe(fn): () => void
 *     createOrder(payload): Promise<orderId>
 *     updateOrderStatus(orderId, nextStatus): Promise<void>
 *     bumpVersion: number   // increments on every snapshot tick
 *   }
 * and the prototype-compatible globals
 *   window.ZONES, window.TABLES, window.TABLE_TOTALS,
 *   window.CATEGORIES, window.MENU, window.SPICE_LABELS,
 *   window.MODIFIERS, window.SEED_TICKETS
 */
(function () {
  'use strict';

  // ─── 0. Auth guard ────────────────────────────────────────────────
  // The page only runs for a signed-in staff member. ar_staff_session
  // is the same localStorage key the existing /staff/login flow sets,
  // so anyone signed in there flows straight through.
  let staffSession = null;
  try { staffSession = JSON.parse(localStorage.getItem('ar_staff_session') || 'null'); } catch (e) {}
  if (!staffSession || !staffSession.restaurantId) {
    window.location.replace('/staff/login');
    return;
  }

  // ─── 1. Firebase init ─────────────────────────────────────────────
  // Hardcoded public web config (same values as the main app's
  // NEXT_PUBLIC_FIREBASE_*). Anyone reading this file gets the
  // same values they'd get from DevTools on /staff/waiter.
  var firebaseConfig = {
    apiKey:            "AIzaSyBRxOfCFdlFLS9VnpHXJ1IbYzYIBwkUjyU",
    authDomain:        "advert-radical.firebaseapp.com",
    projectId:         "advert-radical",
    storageBucket:     "advert-radical.firebasestorage.app",
    messagingSenderId: "1058419742494",
    appId:             "1:1058419742494:web:111d5283fbedec0d48db0f"
  };

  // Initialise the 'staff' app instance — same name as lib/firebase.js
  // so the persisted auth session (in IndexedDB / localStorage keyed
  // by this app name) gets picked up automatically. The staff member
  // signed in on /staff/login → custom token → persisted on 'staff'
  // app → this script finds it.
  var staffApp;
  if (firebase.apps.some(a => a.name === 'staff')) {
    staffApp = firebase.app('staff');
  } else {
    staffApp = firebase.initializeApp(firebaseConfig, 'staff');
  }
  var db = staffApp.firestore();

  // ─── 2. Data store + subscribe layer ──────────────────────────────
  var SV2 = {
    ready: false,
    session: staffSession,
    bumpVersion: 0,
    _listeners: new Set(),
    subscribe: function (fn) {
      SV2._listeners.add(fn);
      return function () { SV2._listeners.delete(fn); };
    },
    _notify: function () {
      SV2.bumpVersion += 1;
      // Repopulate the prototype-compatible globals on every notify
      // so React components re-render against fresh data.
      repopulateGlobals();
      SV2._listeners.forEach(function (l) { try { l(SV2); } catch (e) {} });
    },
  };
  window.SV2 = SV2;

  // Internal raw data from Firestore
  var raw = {
    restaurant: null,
    areas: [],         // [{ id, name, sortOrder }]
    tables: [],        // [{ id, label, code, areaId, capacity, sortOrder }]
    sessions: {},      // tableSessions keyed by table.code
    bills: {},         // open tableBills keyed by billId
    orders: {},        // recent orders keyed by orderId
    menu: [],          // menu items
  };
  window.SV2_RAW = raw;  // for debugging in DevTools

  var rid = staffSession.restaurantId;

  // ─── 3. Subscriptions ────────────────────────────────────────────
  function bootSubscribe(coll, opts, onSnap) {
    var ref = db.collection('restaurants').doc(rid).collection(coll);
    if (opts.orderBy)  ref = ref.orderBy(opts.orderBy, opts.orderDir || 'asc');
    if (opts.where)    ref = ref.where(opts.where.field, opts.where.op, opts.where.value);
    if (opts.limit)    ref = ref.limit(opts.limit);
    return ref.onSnapshot(function (snap) {
      onSnap(snap);
      // After the FIRST batch lands across all subscriptions, mark
      // SV2.ready = true so the UI can stop showing the loading state.
      pending -= 1;
      if (pending <= 0 && !SV2.ready) {
        SV2.ready = true;
      }
      SV2._notify();
    }, function (err) {
      console.error('SV2 subscribe error on', coll, err);
      pending = Math.max(0, pending - 1);
      if (pending <= 0 && !SV2.ready) { SV2.ready = true; SV2._notify(); }
    });
  }

  // restaurant doc (one-shot — rarely changes during a shift)
  var pending = 6; // areas, tables, sessions, bills, orders, menu  (restaurant is separate one-shot)
  db.collection('restaurants').doc(rid).get().then(function (snap) {
    if (snap.exists) {
      raw.restaurant = Object.assign({ id: snap.id }, snap.data());
      SV2._notify();
    }
  }).catch(function (e) { console.error('SV2 restaurant fetch:', e); });

  bootSubscribe('areas', { orderBy: 'sortOrder' }, function (snap) {
    raw.areas = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
  });
  bootSubscribe('tables', { orderBy: 'sortOrder' }, function (snap) {
    raw.tables = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
  });
  bootSubscribe('tableSessions', {}, function (snap) {
    var m = {};
    snap.docs.forEach(function (d) { m[d.id] = Object.assign({ id: d.id }, d.data()); });
    raw.sessions = m;
  });
  bootSubscribe('tableBills', { where: { field: 'status', op: '==', value: 'open' } }, function (snap) {
    var m = {};
    snap.docs.forEach(function (d) { m[d.id] = Object.assign({ id: d.id }, d.data()); });
    raw.bills = m;
  });
  bootSubscribe('orders', { orderBy: 'createdAt', orderDir: 'desc', limit: 300 }, function (snap) {
    // Newest orders first (matches the existing /staff/kitchen pattern).
    var m = {};
    snap.docs.forEach(function (d) { m[d.id] = Object.assign({ id: d.id }, d.data()); });
    raw.orders = m;
  });
  // No orderBy on menuItems — getAllMenuItems() in lib/db.js doesn't
  // orderBy either, and adding it would drop any item missing the
  // ordered field. Filter clientside instead.
  bootSubscribe('menuItems', {}, function (snap) {
    raw.menu = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (i) { return i.isActive !== false; });
  });

  // ─── 4. Map raw → prototype-compatible window globals ─────────────
  var PAID = { paid_cash: 1, paid_card: 1, paid_online: 1, paid: 1 };

  function repopulateGlobals() {
    // ── ZONES ──
    // The prototype expects an array of zone NAMES (strings). We use
    // real area names; tables with no areaId are bucketed into "Floor".
    var zoneNames = raw.areas.map(function (a) { return a.name || 'Area'; });
    if (raw.tables.some(function (t) { return !t.areaId; })) zoneNames.push('Floor');
    if (zoneNames.length === 0) zoneNames = ['Floor'];
    window.ZONES = Array.from(new Set(zoneNames));

    // ── TABLES ──
    // Map our docs into the prototype's shape: { id, zone, shape,
    // seats, status, occupied, x, y, w, h, openedAt }.
    // - shape inferred from capacity (≤2 round, ≥7 long, else square)
    // - status derived from live orders + bill state (same logic as
    //   admin/tables.js)
    var byArea = {};
    raw.tables.forEach(function (t) {
      var areaId = t.areaId || '_unassigned';
      (byArea[areaId] = byArea[areaId] || []).push(t);
    });
    var ordersList = Object.values(raw.orders);
    window.TABLES = raw.tables.map(function (t) {
      var cap = Number(t.capacity) || 4;
      var shape = cap >= 7 ? 'long' : (cap <= 2 ? 'round' : 'square');
      var area = raw.areas.find(function (a) { return a.id === t.areaId; });
      var zone = area ? (area.name || 'Area') : 'Floor';
      var sess = raw.sessions[t.code];
      var billId = sess && sess.currentBillId;
      var bill = billId ? raw.bills[billId] : null;
      var code = String(t.code || '');
      // Union live orders reaching this table (via bill OR by tableNumber match)
      var fromBill = bill ? (bill.orderIds || []).map(function (id) { return raw.orders[id]; }).filter(Boolean) : [];
      var fromTable = code ? ordersList.filter(function (o) {
        if (String(o.tableNumber || '') !== code) return false;
        if (o.orderType === 'takeaway' || o.orderType === 'takeout') return false;
        if (o.status === 'cancelled') return false;
        var done = o.status === 'served' && PAID[o.paymentStatus];
        return !done;
      }) : [];
      var dedup = {};
      fromBill.concat(fromTable).forEach(function (o) { if (o && o.status !== 'cancelled') dedup[o.id] = o; });
      var live = Object.values(dedup);
      var status, occupied = 0, openedAt;
      if (live.length === 0) {
        if (sess && sess.seatedAt) {
          status = 'seated';
          occupied = Number(sess.seatedPartySize) || 0;
        } else {
          status = 'free';
        }
      } else {
        // Has live orders
        var allPaid = live.every(function (o) { return PAID[o.paymentStatus]; });
        if (allPaid || (bill && bill.billPrintedAt)) status = 'ready';
        else status = 'sent';
        occupied = cap; // we don't track real seat count yet; show capacity
      }
      // Capture earliest order time as "opened at" for the table pill
      if (live.length > 0) {
        var earliest = live.reduce(function (a, b) {
          var ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
          var tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
          return ta < tb && ta > 0 ? a : b;
        });
        if (earliest.createdAt && earliest.createdAt.toDate) {
          var d = earliest.createdAt.toDate();
          var h = d.getHours() % 12 || 12;
          openedAt = h + ':' + String(d.getMinutes()).padStart(2, '0');
        }
      }
      return {
        id: t.label || t.code || t.id, // display id
        _docId: t.id,
        _code: t.code,
        zone: zone,
        shape: shape,
        seats: cap,
        x: 1, y: 1, w: 1, h: 1,        // unused — design uses CSS grid auto
        status: status,
        openedAt: openedAt,
        occupied: occupied,
      };
    });

    // ── TABLE_TOTALS ──
    // Running ₹ total per table for the gold badge on each table tile.
    var totals = {};
    window.TABLES.forEach(function (t) {
      var code = String(t._code || '');
      var sess = raw.sessions[code];
      var billId = sess && sess.currentBillId;
      var bill = billId ? raw.bills[billId] : null;
      var fromBill = bill ? (bill.orderIds || []).map(function (id) { return raw.orders[id]; }).filter(Boolean) : [];
      var fromTable = code ? ordersList.filter(function (o) {
        if (String(o.tableNumber || '') !== code) return false;
        if (o.orderType === 'takeaway' || o.orderType === 'takeout') return false;
        if (o.status === 'cancelled') return false;
        var done = o.status === 'served' && PAID[o.paymentStatus];
        return !done;
      }) : [];
      var dedup = {};
      fromBill.concat(fromTable).forEach(function (o) { if (o && o.status !== 'cancelled') dedup[o.id] = o; });
      totals[t.id] = Object.values(dedup).reduce(function (s, o) { return s + (Number(o.total) || 0); }, 0);
    });
    window.TABLE_TOTALS = totals;

    // ── CATEGORIES ──
    // Derive from menu items. Map name → emoji using the same fuzzy
    // table as the React version had.
    var seen = new Set();
    var cats = [];
    raw.menu.forEach(function (m) {
      var c = (m.category || '').trim() || 'Other';
      if (seen.has(c)) return;
      seen.add(c);
      cats.push({ id: c, label: c, emoji: emojiForCategory(c) });
    });
    window.CATEGORIES = cats;

    // ── MENU ──
    // Map our menu doc → prototype's shape:
    // { id, cat, name, desc, price, veg, spice, emoji, tint }
    window.MENU = raw.menu.map(function (m) {
      return {
        id: m.id,
        cat: ((m.category || '').trim() || 'Other'),
        name: m.name || '',
        desc: m.description || '',
        price: Number(m.price) || 0,
        veg: m.isVeg !== false,
        spice: spiceToInt(m.spiceLevel),
        emoji: emojiForCategory((m.category || '').trim()) || '🍽',
        tint: tintFor(m.id || m.name),
        imageURL: m.imageURL || null,
        availableUntil: m.availableUntil || null,
      };
    });

    // ── SEED_TICKETS ──
    // Replace the prototype's mock tickets with REAL active orders
    // (status: pending / preparing / ready / awaiting_payment).
    var statusMap = {
      pending: 'new',
      awaiting_payment: 'new',
      preparing: 'cooking',
      ready: 'ready',
    };
    var ticks = [];
    Object.values(raw.orders).forEach(function (o) {
      var b = statusMap[o.status];
      if (!b) return;
      if (o.status === 'cancelled') return;
      if (o.orderType === 'takeaway' || o.orderType === 'takeout') return;
      // age in minutes
      var created = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate() : new Date();
      var ageMin = Math.max(0, Math.floor((Date.now() - created.getTime()) / 60000));
      var placedAt = (created.getHours() % 12 || 12) + ':' + String(created.getMinutes()).padStart(2, '0');
      ticks.push({
        id: '#' + (o.orderNumber ? String(o.orderNumber).padStart(4, '0') : String(o.id || '').slice(-4).toUpperCase()),
        _orderId: o.id,
        table: String(o.tableNumber || '-'),
        zone: o.zone || 'Floor',
        waiter: o.placedBy || o.waiterName || '',
        placedAt: placedAt,
        ageMin: ageMin,
        status: b,
        items: (o.items || []).map(function (it) {
          return {
            name: it.name || '',
            qty: Number(it.qty) || 1,
            seat: Number(it.seat) || 0,
            spice: Number(it.spice) || spiceToInt(it.spiceLevel),
            notes: it.modifiers || it.notes || [],
            note: it.note || '',
          };
        }),
      });
    });
    window.SEED_TICKETS = ticks;

    // Constants (don't change — but defined here for completeness)
    window.SPICE_LABELS = ['No spice', 'Mild', 'Medium', 'Spicy', 'Very spicy'];
    window.MODIFIERS = ['Extra spicy', 'No onion', 'No garlic', 'Less oil', 'Extra gravy', 'Jain'];
  }

  // Initialise empty globals so first render of app.jsx doesn't crash
  window.ZONES = ['Floor'];
  window.TABLES = [];
  window.TABLE_TOTALS = {};
  window.CATEGORIES = [];
  window.MENU = [];
  window.SEED_TICKETS = [];
  window.SPICE_LABELS = ['No spice', 'Mild', 'Medium', 'Spicy', 'Very spicy'];
  window.MODIFIERS = ['Extra spicy', 'No onion', 'No garlic', 'Less oil', 'Extra gravy', 'Jain'];

  // ─── 5. Actions: createOrder / updateOrderStatus ─────────────────
  SV2.createOrder = function (payload) {
    // Mirrors lib/db.js createOrder — transaction-based orderNumber.
    var ordersCol = db.collection('restaurants').doc(rid).collection('orders');
    var dayKey = _todayKey();
    var counterRef = db.collection('restaurants').doc(rid).collection('orderCounters').doc(dayKey);
    var orderRef = ordersCol.doc(); // pre-allocate id
    return db.runTransaction(function (tx) {
      return tx.get(counterRef).then(function (snap) {
        var current = (snap.exists && snap.data().nextOrder) || 0;
        var next = current + 1;
        tx.set(counterRef, { nextOrder: next, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        tx.set(orderRef, Object.assign({}, payload, {
          orderNumber: next,
          orderDay: dayKey,
          status: 'pending',
          paymentStatus: payload.paymentStatus || 'unpaid',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        }));
        return next;
      });
    }).then(function (orderNumber) {
      return { id: orderRef.id, orderNumber: orderNumber };
    }).catch(function (err) {
      // Fallback: no counter, just write the order
      console.warn('SV2 createOrder counter failed, fallback:', err);
      return ordersCol.add(Object.assign({}, payload, {
        status: 'pending',
        paymentStatus: payload.paymentStatus || 'unpaid',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      })).then(function (ref) { return { id: ref.id, orderNumber: null }; });
    });
  };

  SV2.updateOrderStatus = function (orderId, nextStatus) {
    return db.collection('restaurants').doc(rid).collection('orders').doc(orderId).update({
      status: nextStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  };

  // Tick the kitchen ages every 30s so badges advance even when no
  // new data arrives. Same as the prototype's setInterval.
  setInterval(function () {
    Object.values(raw.orders).forEach(function (o) { /* triggers a notify */ });
    SV2._notify();
  }, 30000);

  // ─── helpers ──────────────────────────────────────────────────────
  function _todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function spiceToInt(v) {
    if (typeof v === 'number') return Math.max(0, Math.min(4, Math.round(v)));
    var s = String(v || '').toLowerCase().replace(/\s/g, '');
    if (s.indexOf('veryspicy') === 0) return 4;
    if (s.indexOf('spicy') === 0) return 3;
    if (s.indexOf('medium') === 0) return 2;
    if (s.indexOf('mild') === 0) return 1;
    return 0;
  }
  function emojiForCategory(cat) {
    if (!cat) return '🍽';
    var c = String(cat).toLowerCase();
    if (/(starter|appetiz|snack)/.test(c)) return '🥗';
    if (/(main|curry)/.test(c)) return '🍛';
    if (/(bread|naan|roti|paratha|kulcha)/.test(c)) return '🫓';
    if (/(biryani|rice|pulao)/.test(c)) return '🍚';
    if (/(dessert|sweet|ice cream|kulfi)/.test(c)) return '🍰';
    if (/(drink|beverag|lassi|chai|coffee|tea|soda|juice|mocktail|cocktail)/.test(c)) return '🥤';
    if (/(pizza)/.test(c)) return '🍕';
    if (/(burger)/.test(c)) return '🍔';
    if (/(pasta|noodle)/.test(c)) return '🍝';
    if (/(soup|broth)/.test(c)) return '🍲';
    if (/(salad)/.test(c)) return '🥗';
    if (/(seafood|fish|prawn)/.test(c)) return '🐟';
    if (/(chicken|meat|lamb|mutton|beef|kebab)/.test(c)) return '🍗';
    if (/(breakfast|egg)/.test(c)) return '🍳';
    return '🍽';
  }
  var TINTS = ['#C2562B', '#9A3F1C', '#C4A86D', '#A88247', '#4A7A5A', '#E8C89A', '#B52020', '#5A2310', '#8FC4A8', '#F4A0B0'];
  function tintFor(s) {
    if (!s) return '#C4A86D';
    var h = 0;
    s = String(s);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return TINTS[Math.abs(h) % TINTS.length];
  }
})();
