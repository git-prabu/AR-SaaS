// components/staff-v2/screens/ConfirmScreen.jsx
//
// Sent-confirmation screen with ring + check animation. Three ticket
// meta cards (Ticket / Table / Sent timestamp). Pulsing "Routed to
// kitchen" badge. Two CTAs: back to floor / view kitchen rail.

import { I } from '../ui/icons';

export default function ConfirmScreen({ ticket, onNewOrder, onViewKitchen }) {
  if (!ticket) return null;
  const itemTotal = (ticket.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
  return (
    <div className="screen screen-enter">
      <div className="confirm">
        <div className="ring">
          <span className="check">{I.check}</span>
        </div>
        <h2>Order sent</h2>
        <p className="c-sub">Ticket {ticket.id} is on the kitchen rail for {ticket.table}.</p>

        <div className="ticket-meta">
          <div className="tm-card"><div className="tm-k">Ticket</div><div className="tm-v">{ticket.id}</div></div>
          <div className="tm-card"><div className="tm-k">Table</div><div className="tm-v">{ticket.table}</div></div>
          <div className="tm-card"><div className="tm-k">Sent</div><div className="tm-v">{ticket.placedAt}</div></div>
        </div>

        <div className="routed">
          <span className="pulse" />
          Routed to kitchen · {itemTotal} {itemTotal === 1 ? 'item' : 'items'}
        </div>

        <div className="confirm-actions">
          <button className="cta" onClick={onNewOrder}>Back to floor</button>
          <button className="cta dark" onClick={onViewKitchen}>View kitchen rail {I.chevR}</button>
        </div>
      </div>
    </div>
  );
}
