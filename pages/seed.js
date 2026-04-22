// pages/seed.js — dev-only data seeder. 404s in production builds.
// The comment used to say "DELETE THIS FILE after seeding" but keeping the
// seeding logic around is cheap; the real fix is to make it unreachable from
// the public URL once deployed. getServerSideProps below does that.
import { useState } from 'react';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Production gate — any non-dev build returns 404 instead of rendering the
// page. In dev (NODE_ENV !== 'production') the page works as before so a new
// restaurant can still be seeded during local setup.
export async function getServerSideProps() {
  if (process.env.NODE_ENV === 'production') {
    return { notFound: true };
  }
  return { props: {} };
}

const RESTAURANT_ID = 'lW13UEilaJ9vEsOURYyq';

const MENU_ITEMS = [
  { name: 'Grilled Fish', category: "Chef's Special", description: 'Grilled fillets of Sear Fish with roasted potatoes, green beans and herb lemon butter sauce', ingredients: ['Sear Fish', 'Roasted Potatoes', 'Green Beans', 'Herb Lemon Butter'], calories: 420, protein: 38, carbs: 22, fats: 18, price: 690, isVeg: false },
  { name: 'Malabar Fish Curry', category: "Chef's Special", description: 'Traditional Kerala speciality with coconut milk, malabar tamarind, ginger served with rice', ingredients: ['Fish', 'Coconut Milk', 'Malabar Tamarind', 'Ginger', 'Rice'], calories: 480, protein: 32, carbs: 45, fats: 16, price: 620, isVeg: false },
  { name: 'Fritto Misto', category: 'Starters', description: 'Deep fried calamari and prawns, fresh garlic, parsley, lime, with tartare sauce', ingredients: ['Calamari', 'Prawns', 'Garlic', 'Parsley', 'Lime', 'Tartare Sauce'], calories: 390, protein: 28, carbs: 30, fats: 18, price: 470, isVeg: false },
  { name: 'Prawn Milagu Masala', category: 'Starters', description: 'Dry stir-fried prawns with black pepper and bell peppers', ingredients: ['Prawns', 'Black Pepper', 'Bell Peppers'], calories: 310, protein: 30, carbs: 8, fats: 14, price: 580, isVeg: false },
  { name: 'Beef Vindali', category: "Chef's Special", description: 'Pondicherrian speciality cooked in vinegar served with rice', ingredients: ['Beef', 'Vinegar', 'Spices', 'Rice'], calories: 520, protein: 42, carbs: 38, fats: 22, price: 580, isVeg: false },
  { name: 'Bouef Bourguignon', category: "Chef's Special", description: 'A French classic with slow-cooked beef, red wine, carrot, potato, mushroom, pearl onions', ingredients: ['Beef', 'Red Wine', 'Carrot', 'Potato', 'Mushroom', 'Pearl Onions'], calories: 560, protein: 40, carbs: 30, fats: 24, price: 580, isVeg: false },
  { name: 'Pondicherry Chicken Curry', category: "Chef's Special", description: 'With drumstick and potato in rich coconut gravy served with rice', ingredients: ['Chicken', 'Drumstick', 'Potato', 'Coconut Gravy', 'Rice'], calories: 490, protein: 36, carbs: 42, fats: 18, price: 520, isVeg: false },
  { name: 'Spicy Chicken Coconut Fry', category: 'Starters', description: 'Sauteed chicken with coconut and Pondicherry masala', ingredients: ['Chicken', 'Coconut', 'Pondicherry Masala'], calories: 380, protein: 32, carbs: 10, fats: 20, price: 390, isVeg: false },
  { name: 'Buffalo Chicken Wings', category: 'Starters', description: 'Fried wings dipping in a hot sauce, blue cheese dressing', ingredients: ['Chicken Wings', 'Hot Sauce', 'Blue Cheese Dressing'], calories: 440, protein: 28, carbs: 12, fats: 30, price: 360, isVeg: false },
  { name: 'Pepper Paneer', category: "Chef's Special", description: 'South Indian pepper infused spicy gravy with malai paneer and rice', ingredients: ['Paneer', 'Black Pepper', 'Malai', 'Rice', 'Spices'], calories: 450, protein: 22, carbs: 40, fats: 20, price: 480, isVeg: true },
  { name: 'Vegetable Millet Biryani', category: "Chef's Special", description: 'Served with cucumber-tomato and beetroot raitha, tomato-dates chutney', ingredients: ['Millet', 'Mixed Vegetables', 'Cucumber', 'Tomato', 'Beetroot Raitha'], calories: 380, protein: 12, carbs: 62, fats: 8, price: 410, isVeg: true },
  { name: 'Lentil Dumplings Curry', category: "Chef's Special", description: 'Lentil dumplings simmered in a gravy served with rice', ingredients: ['Lentils', 'Dumplings', 'Curry Gravy', 'Rice'], calories: 340, protein: 18, carbs: 52, fats: 8, price: 480, isVeg: true },
  { name: 'Polenta with Mushroom', category: "Chef's Special", description: 'Rosemary and garlic infused pan fried polenta on a bed of lentil ragout', ingredients: ['Polenta', 'Mushroom', 'Rosemary', 'Garlic', 'Lentil Ragout'], calories: 310, protein: 10, carbs: 48, fats: 10, price: 380, isVeg: true },
  { name: 'Margherita Classic', category: 'Pizza', description: 'Fresh Fior Di Latte, Italian San Marzano Sauce, Fresh Basil', ingredients: ['Fior Di Latte', 'San Marzano Sauce', 'Fresh Basil', 'Pizza Dough'], calories: 620, protein: 22, carbs: 75, fats: 22, price: 590, isVeg: true },
  { name: 'Verdure Grigliate', category: 'Pizza', description: 'Grilled Zucchine, Grilled Capsicum, Confi Garlic, Fresh Onions, Italian San Marzano sauce', ingredients: ['Zucchini', 'Capsicum', 'Confi Garlic', 'Fresh Onions', 'San Marzano Sauce'], calories: 580, protein: 18, carbs: 72, fats: 18, price: 680, isVeg: true },
  { name: 'Pollo Affumicato', category: 'Pizza', description: 'Smoked Chicken, Green Herbs, Fior Di Latte, Italian San Marzano Sauce', ingredients: ['Smoked Chicken', 'Green Herbs', 'Fior Di Latte', 'San Marzano Sauce'], calories: 720, protein: 38, carbs: 72, fats: 26, price: 850, isVeg: false },
  { name: 'Bianca With Funghi', category: 'Pizza', description: 'Mix of Seasoning Mushrooms, White Onions, Italian Parmesan Cream and Fior Di Latte', ingredients: ['Mixed Mushrooms', 'White Onions', 'Parmesan Cream', 'Fior Di Latte'], calories: 680, protein: 24, carbs: 68, fats: 28, price: 720, isVeg: true },
  { name: 'Spicy Italian Salami', category: 'Pizza', description: 'Italian Pepperoni, Spicy Cheddar, Fior Di Latte, Italian San Marzano Sauce', ingredients: ['Italian Pepperoni', 'Spicy Cheddar', 'Fior Di Latte', 'San Marzano Sauce'], calories: 760, protein: 34, carbs: 70, fats: 34, price: 890, isVeg: false },
  { name: 'Spaghetti Fruti Di Mare', category: 'Pasta', description: 'Prawns, squid, cuttle fish, white wine, garlic sauce', ingredients: ['Prawns', 'Squid', 'Cuttle Fish', 'White Wine', 'Garlic', 'Spaghetti'], calories: 580, protein: 36, carbs: 65, fats: 14, price: 650, isVeg: false },
  { name: 'Authentic Lasagne', category: 'Pasta', description: 'Minced beef, tomato sauce, bechamel, emmental', ingredients: ['Minced Beef', 'Tomato Sauce', 'Bechamel', 'Emmental Cheese', 'Pasta'], calories: 620, protein: 34, carbs: 52, fats: 28, price: 540, isVeg: false },
  { name: 'Penne Primavera Pesto', category: 'Pasta', description: 'Zucchini, broccoli, cherry tomatoes, red and yellow peppers, cashew basil pesto', ingredients: ['Penne', 'Zucchini', 'Broccoli', 'Cherry Tomatoes', 'Cashew Basil Pesto'], calories: 480, protein: 16, carbs: 68, fats: 16, price: 440, isVeg: true },
  { name: 'Vegetable Lasagne', category: 'Pasta', description: 'Spinach, zucchini, carrot, pesto, ricotta, salad', ingredients: ['Spinach', 'Zucchini', 'Carrot', 'Pesto', 'Ricotta', 'Pasta'], calories: 520, protein: 18, carbs: 58, fats: 20, price: 450, isVeg: true },
  { name: 'The Spot Beef Burger', category: 'Burgers', description: 'Homemade bun, minced beef, mustard-mayo, tomatoes, gherkins, onions, salad, French fries and relish sauce', ingredients: ['Beef Patty', 'Homemade Bun', 'Mustard Mayo', 'Tomatoes', 'Gherkins', 'French Fries'], calories: 720, protein: 38, carbs: 68, fats: 32, price: 580, isVeg: false },
  { name: 'The Spot Crispy Chicken Burger', category: 'Burgers', description: 'Homemade bun, bread crumbed chicken, mustard-mayo, tomatoes, gherkins, onions, salad, French fries', ingredients: ['Crispy Chicken', 'Homemade Bun', 'Mustard Mayo', 'Tomatoes', 'Gherkins', 'French Fries'], calories: 680, protein: 34, carbs: 70, fats: 28, price: 540, isVeg: false },
  { name: 'Croque Madame', category: 'Burgers', description: 'Sandwich bread, homemade ham, bechamel sauce, emmental cheese, sunnyside egg, side salad', ingredients: ['Sandwich Bread', 'Ham', 'Bechamel Sauce', 'Emmental Cheese', 'Egg'], calories: 560, protein: 28, carbs: 42, fats: 30, price: 480, isVeg: false },
  { name: 'Paneer Kaati Roll', category: 'Burgers', description: 'Cottage cheese, crispy vegetables, mint chutney wrapped in paratha, French fries', ingredients: ['Paneer', 'Crispy Vegetables', 'Mint Chutney', 'Paratha', 'French Fries'], calories: 490, protein: 18, carbs: 58, fats: 18, price: 310, isVeg: true },
  { name: 'Tiramisu', category: 'Desserts', description: 'The only one in town with real mascarpone', ingredients: ['Mascarpone', 'Espresso', 'Ladyfinger Biscuits', 'Cocoa', 'Eggs'], calories: 420, protein: 8, carbs: 48, fats: 22, price: 490, isVeg: true },
  { name: 'Chocolate Sin', category: 'Desserts', description: 'Rich chocolate mousse covered with ganache', ingredients: ['Dark Chocolate', 'Mousse', 'Ganache', 'Cream'], calories: 480, protein: 6, carbs: 52, fats: 28, price: 380, isVeg: true },
  { name: 'Waffle', category: 'Desserts', description: 'With maple syrup', ingredients: ['Waffle Batter', 'Maple Syrup', 'Butter'], calories: 380, protein: 8, carbs: 58, fats: 14, price: 180, isVeg: true },
  { name: 'Lemon Tart', category: 'Desserts', description: 'With meringue', ingredients: ['Lemon Curd', 'Tart Shell', 'Meringue'], calories: 340, protein: 4, carbs: 52, fats: 12, price: 320, isVeg: true },
  { name: 'Eggs Benedict', category: 'Breakfast', description: 'Toasted brioche, homemade pork ham and hollandaise sauce with grilled tomato and potato roesti', ingredients: ['Brioche', 'Pork Ham', 'Hollandaise Sauce', 'Eggs', 'Grilled Tomato', 'Potato Roesti'], calories: 560, protein: 28, carbs: 42, fats: 32, price: 320, isVeg: false },
  { name: 'Savory Waffle', category: 'Breakfast', description: 'Salted waffle, caponata vegetables, basil mayonnaise', ingredients: ['Waffle', 'Caponata Vegetables', 'Basil Mayonnaise'], calories: 420, protein: 10, carbs: 52, fats: 18, price: 280, isVeg: true },
  { name: 'Sunrise At The Spot', category: 'Cocktails', description: 'Vodka, orange liqueur, orange juice, grenadine syrup', ingredients: ['Vodka', 'Orange Liqueur', 'Orange Juice', 'Grenadine'], calories: 180, protein: 0, carbs: 22, fats: 0, price: 580, isVeg: true },
  { name: 'Ginger Brew', category: 'Beverages', description: 'Ginger, mint, lemon zest infusion and honey', ingredients: ['Ginger', 'Mint', 'Lemon Zest', 'Honey'], calories: 80, protein: 0, carbs: 20, fats: 0, price: 220, isVeg: true },
  { name: 'Spicy Guava Lady', category: 'Mocktails', description: 'Lime juice, orange juice, guava juice, mint, salt, chilli powder, tabasco', ingredients: ['Lime Juice', 'Orange Juice', 'Guava Juice', 'Mint', 'Chilli', 'Tabasco'], calories: 120, protein: 1, carbs: 28, fats: 0, price: 250, isVeg: true },
];

export default function SeedPage() {
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState([]);

  const addLog = (msg) => setLog(prev => [...prev, msg]);

  const runSeed = async () => {
    setStatus('running');
    setProgress(0);
    setLog([]);
    try {
      const colRef = collection(db, 'restaurants', RESTAURANT_ID, 'menuItems');
      for (let i = 0; i < MENU_ITEMS.length; i++) {
        const item = MENU_ITEMS[i];
        await addDoc(colRef, { ...item, modelURL: null, imageURL: null, views: 0, arViews: 0, isActive: true, createdAt: new Date() });
        setProgress(Math.round(((i + 1) / MENU_ITEMS.length) * 100));
        addLog('Added: ' + item.name + ' (' + item.category + ')');
      }
      await updateDoc(doc(db, 'restaurants', RESTAURANT_ID), { itemsUsed: MENU_ITEMS.length });
      setStatus('done');
    } catch (err) {
      setStatus('error');
      addLog('Error: ' + err.message);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#09090B', color: '#F2F2EE', fontFamily: 'monospace', padding: '40px', maxWidth: '720px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '8px', color: '#FF6B35' }}>The Spot Menu Seeder</h1>
      <p style={{ color: '#8E8E9A', marginBottom: '32px', fontSize: '14px' }}>Seeds {MENU_ITEMS.length} items. Delete pages/seed.js after done!</p>

      {status === 'idle' && (
        <button onClick={runSeed} style={{ padding: '12px 32px', background: 'linear-gradient(135deg, #FF6B35, #FFB347)', border: 'none', borderRadius: '12px', color: 'white', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>
          Run Seed
        </button>
      )}

      {status === 'running' && (
        <div>
          <div style={{ background: '#27272E', borderRadius: '8px', height: '8px', overflow: 'hidden', marginBottom: '8px' }}>
            <div style={{ width: progress + '%', height: '100%', background: 'linear-gradient(90deg, #FF6B35, #FFB347)', transition: 'width 0.2s' }} />
          </div>
          <p style={{ color: '#FF6B35', fontSize: '14px' }}>{progress}% complete...</p>
        </div>
      )}

      {status === 'done' && (
        <div style={{ padding: '16px', background: '#16a34a20', border: '1px solid #16a34a', borderRadius: '12px', marginBottom: '16px' }}>
          <p style={{ color: '#4ade80', fontWeight: 'bold' }}>Done! {MENU_ITEMS.length} items seeded.</p>
          <p style={{ color: '#8E8E9A', fontSize: '13px', marginTop: '8px' }}>Visit localhost:3000/restaurant/spot to see your menu!</p>
          <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '4px' }}>Remember to delete pages/seed.js now!</p>
        </div>
      )}

      {status === 'error' && (
        <div style={{ padding: '16px', background: '#ef444420', border: '1px solid #ef4444', borderRadius: '12px', marginBottom: '16px' }}>
          <p style={{ color: '#f87171' }}>Seeding failed. Check log below.</p>
        </div>
      )}

      {log.length > 0 && (
        <div style={{ marginTop: '24px', padding: '16px', background: '#111115', borderRadius: '12px', border: '1px solid #27272E', maxHeight: '400px', overflowY: 'auto' }}>
          {log.map((entry, i) => (
            <div key={i} style={{ fontSize: '12px', color: entry.startsWith('Error') ? '#f87171' : '#8E8E9A', marginBottom: '2px' }}>{entry}</div>
          ))}
        </div>
      )}
    </div>
  );
}
