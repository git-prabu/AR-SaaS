import Head from 'next/head';
import Link from 'next/link';

const plans = [
  { name:'Basic',   price:'₹999',   per:'/6 months', items:10,  storage:'500MB', tag:null },
  { name:'Pro',     price:'₹2,499', per:'/6 months', items:40,  storage:'2GB',   tag:'Popular' },
  { name:'Premium', price:'₹4,999', per:'/6 months', items:100, storage:'5GB',   tag:'Best Value' },
];

const features = [
  { icon:'🥗', title:'AR Menu Viewing',    desc:'Customers scan your QR code and see dishes float in real 3D — no app needed.' },
  { icon:'📊', title:'Analytics Dashboard',desc:'Track visits, item views, repeat customers and AR interactions in real time.' },
  { icon:'🔗', title:'Your Own Subdomain', desc:'Every restaurant gets a dedicated URL — spot.advertradical.com.' },
  { icon:'📱', title:'No App Required',    desc:'Powered by WebAR. Customers just scan — no downloads, no friction.' },
  { icon:'🔔', title:'Offers & Promotions',desc:'Push limited-time offers that appear as banners on your live menu.' },
  { icon:'🔒', title:'Secure & Scalable',  desc:'Firebase-backed with plan enforcement, storage limits, and payment protection.' },
];

export default function HomePage() {
  return (
    <>
      <Head>
        <title>Advert Radical — AR Menus for Restaurants</title>
        <meta name="description" content="Give your restaurant an AR-powered menu. Customers scan, see food in 3D."/>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
      </Head>

      <div style={{minHeight:'100vh',background:'linear-gradient(145deg,#F5A876 0%,#F0906A 40%,#C8A8D8 100%)',fontFamily:'Inter,sans-serif',color:'#2A1F10',overflowX:'hidden',position:'relative'}}>
        <style>{`
          *{box-sizing:border-box;margin:0;padding:0} a{text-decoration:none}
          @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
          @keyframes floatR{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-9px) rotate(7deg)}}
          @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
          @keyframes fadeUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
          .float{animation:float 5s ease-in-out infinite}
          .float2{animation:float 7s ease-in-out 1.5s infinite}
          .floatR{animation:floatR 6s ease-in-out 0.8s infinite}

          /* Floating pill nav */
          .nav{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:50;
            background:rgba(255,245,225,0.75);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
            border:1.5px solid rgba(255,220,160,0.6);border-radius:50px;
            padding:10px 24px;display:flex;align-items:center;gap:24px;
            box-shadow:0 8px 32px rgba(120,70,30,0.15),inset 0 1px 0 rgba(255,255,255,0.6);
            width:calc(100% - 40px);max-width:840px;}
          .nlnk{font-size:14px;color:rgba(42,31,16,0.6);font-weight:500;transition:color 0.15s;}
          .nlnk:hover{color:#2A1F10;}

          /* Clay card */
          .cc{background:rgba(255,245,225,0.72);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
            border:1.5px solid rgba(255,215,155,0.55);border-radius:22px;
            box-shadow:0 8px 28px rgba(120,70,30,0.12),inset 0 1px 0 rgba(255,255,255,0.65);
            transition:all 0.22s cubic-bezier(0.34,1.56,0.64,1);}
          .cc:hover{transform:translateY(-5px);box-shadow:0 20px 48px rgba(120,70,30,0.18);}

          /* Plan card */
          .pc{background:rgba(255,245,225,0.75);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
            border:1.5px solid rgba(255,215,155,0.5);border-radius:24px;padding:30px;position:relative;
            box-shadow:0 8px 28px rgba(120,70,30,0.1),inset 0 1px 0 rgba(255,255,255,0.65);
            transition:all 0.22s;}
          .pc.pop{border-color:rgba(224,90,58,0.4);box-shadow:0 12px 40px rgba(224,90,58,0.15);}
          .pc:hover{transform:translateY(-4px);}

          /* Coral button */
          .btn-coral{background:linear-gradient(135deg,#E05A3A,#F07050);color:#fff;border:none;border-radius:50px;
            font-family:Poppins,sans-serif;font-weight:700;cursor:pointer;transition:all 0.2s;
            box-shadow:0 8px 24px rgba(224,90,58,0.35);}
          .btn-coral:hover{transform:translateY(-2px);box-shadow:0 14px 32px rgba(224,90,58,0.45);}

          .btn-ghost{background:rgba(255,255,255,0.5);color:#2A1F10;border:1.5px solid rgba(200,140,80,0.35);
            border-radius:50px;font-weight:600;cursor:pointer;transition:all 0.2s;backdrop-filter:blur(8px);}
          .btn-ghost:hover{background:rgba(255,255,255,0.75);}

          .inner{max-width:1100px;margin:0 auto;padding:0 24px;}
          .inner-sm{max-width:820px;margin:0 auto;padding:0 24px;}
          .section{padding:72px 0;position:relative;}
          @media(max-width:768px){.inner .hero-split{grid-template-columns:1fr!important;}}
        `}</style>

        {/* Clay floating shapes — like the 3D objects in Skate Girl */}
        {/* White clouds */}
        <div style={{position:'fixed',top:'7%',right:'9%',width:100,height:55,background:'rgba(255,255,255,0.6)',borderRadius:'50px 50px 50px 50px',boxShadow:'0 8px 24px rgba(180,120,60,0.1)',pointerEvents:'none',zIndex:0}} className="float"/>
        <div style={{position:'fixed',top:'6%',right:'15%',width:65,height:40,background:'rgba(255,255,255,0.5)',borderRadius:50,boxShadow:'0 6px 16px rgba(180,120,60,0.08)',pointerEvents:'none',zIndex:0}} className="float2"/>
        {/* Clay spheres */}
        <div style={{position:'fixed',bottom:'28%',left:'3%',width:72,height:72,borderRadius:'50%',background:'linear-gradient(135deg,#C4B5D4,#D4C5E4)',boxShadow:'0 12px 32px rgba(120,80,160,0.2)',pointerEvents:'none',zIndex:0}} className="float2"/>
        <div style={{position:'fixed',top:'35%',right:'4%',width:52,height:52,borderRadius:'50%',background:'linear-gradient(135deg,#8FC4A8,#A8D4BC)',boxShadow:'0 8px 20px rgba(60,120,80,0.2)',pointerEvents:'none',zIndex:0}} className="floatR"/>
        <div style={{position:'fixed',top:'18%',left:'4%',width:60,height:60,borderRadius:'50%',background:'linear-gradient(135deg,#F4A0B0,#FFBCC8)',boxShadow:'0 10px 24px rgba(200,80,100,0.18)',pointerEvents:'none',zIndex:0}} className="float"/>
        <div style={{position:'fixed',bottom:'15%',right:'6%',width:44,height:44,borderRadius:14,background:'linear-gradient(135deg,#F4D070,#F0C040)',boxShadow:'0 8px 20px rgba(180,140,30,0.2)',pointerEvents:'none',zIndex:0,animationDelay:'2s'}} className="float"/>
        {/* Big soft depth circles */}
        <div style={{position:'fixed',bottom:'-20%',right:'-8%',width:500,height:500,borderRadius:'50%',background:'rgba(255,255,255,0.12)',pointerEvents:'none',zIndex:0}}/>
        <div style={{position:'fixed',top:'-12%',left:'-6%',width:380,height:380,borderRadius:'50%',background:'rgba(255,255,255,0.1)',pointerEvents:'none',zIndex:0}}/>

        {/* Floating pill NAV */}
        <nav className="nav">
          <span style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:17,color:'#2A1F10',flexShrink:0}}>
            Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F4A86A)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
          </span>
          <div style={{flex:1}}/>
          <div style={{display:'flex',alignItems:'center',gap:22}}>
            <a href="#features" className="nlnk">Features</a>
            <a href="#plans" className="nlnk">Plans</a>
            <Link href="/admin/login" className="nlnk">Login</Link>
            <Link href="/superadmin/login" style={{padding:'8px 20px',background:'#1E1B18',color:'rgba(255,220,180,0.9)',borderRadius:30,fontSize:13,fontWeight:600}}>Admin</Link>
          </div>
        </nav>

        {/* HERO — Timescope split layout */}
        <section style={{paddingTop:120,paddingBottom:40,position:'relative',zIndex:1}}>
          <div className="inner" style={{display:'grid',gridTemplateColumns:'1fr 1fr',alignItems:'center',gap:40,minHeight:'80vh'}}>

            {/* LEFT — text */}
            <div style={{animation:'fadeUp 0.9s ease forwards'}}>
              <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'7px 18px',borderRadius:30,background:'rgba(255,255,255,0.55)',border:'1.5px solid rgba(255,215,155,0.6)',backdropFilter:'blur(10px)',fontSize:13,fontWeight:600,color:'#8B4020',marginBottom:28,boxShadow:'0 4px 16px rgba(120,70,30,0.1)'}}>
                <span style={{width:7,height:7,borderRadius:'50%',background:'#E05A3A',animation:'blink 2s infinite'}}/>
                WebAR Menu Platform for Restaurants
              </div>

              <h1 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:'clamp(36px,4.5vw,62px)',lineHeight:1.08,letterSpacing:'-0.025em',color:'#1E1B18',marginBottom:22}}>
                Your menu,<br/>
                <span style={{background:'linear-gradient(135deg,#E05A3A,#F07050)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>alive in 3D</span>
              </h1>

              <p style={{fontSize:'clamp(15px,1.4vw,18px)',color:'rgba(42,31,16,0.6)',maxWidth:440,marginBottom:36,lineHeight:1.75}}>
                Customers scan your QR code, point at the table, and watch food materialize in augmented reality — nutrition info included.
              </p>

              <div style={{display:'flex',gap:14,flexWrap:'wrap',marginBottom:48}}>
                <Link href="/admin/login"><button className="btn-coral" style={{padding:'15px 30px',fontSize:15}}>Get Started Free →</button></Link>
                <a href="#features"><button className="btn-ghost" style={{padding:'15px 30px',fontSize:15}}>See How It Works</button></a>
              </div>

              {/* Trust row */}
              <div style={{fontSize:12,color:'rgba(42,31,16,0.4)',fontWeight:600,letterSpacing:'0.05em',textTransform:'uppercase',marginBottom:14}}>
                Works at restaurants across India
              </div>
              <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                {['🍜 Noodle Bars','🍗 Biryani Houses','🍕 Pizzerias','🥗 Café & Bistros'].map(t=>(
                  <span key={t} style={{padding:'5px 13px',borderRadius:20,background:'rgba(255,255,255,0.5)',border:'1.5px solid rgba(255,215,155,0.5)',fontSize:12,fontWeight:600,color:'rgba(42,31,16,0.6)',backdropFilter:'blur(8px)'}}>{t}</span>
                ))}
              </div>
            </div>

            {/* RIGHT — 3D Clay Food Scene SVG */}
            <div style={{position:'relative',animation:'fadeUp 1.1s ease 0.2s both'}}>
              {/* Glow behind scene */}
              <div style={{position:'absolute',top:'10%',left:'5%',right:'5%',bottom:'5%',background:'radial-gradient(ellipse,rgba(255,255,255,0.35),transparent 70%)',borderRadius:'50%',filter:'blur(20px)',pointerEvents:'none'}}/>

              <svg viewBox="0 0 580 500" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'auto',filter:'drop-shadow(0 24px 48px rgba(120,70,30,0.22))',position:'relative'}}>
                <defs>
                  <filter id="sf" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="rgba(120,70,30,0.18)"/>
                  </filter>
                  <filter id="sf2" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="rgba(120,70,30,0.14)"/>
                  </filter>
                  <radialGradient id="gTable" cx="50%" cy="40%">
                    <stop offset="0%" stopColor="#FFF5DC"/>
                    <stop offset="100%" stopColor="#F4D898"/>
                  </radialGradient>
                  <radialGradient id="gBowl" cx="35%" cy="30%">
                    <stop offset="0%" stopColor="#FFECD0"/>
                    <stop offset="100%" stopColor="#E8906A"/>
                  </radialGradient>
                  <radialGradient id="gGreen" cx="35%" cy="30%">
                    <stop offset="0%" stopColor="#B8E4CC"/>
                    <stop offset="100%" stopColor="#5A9A78"/>
                  </radialGradient>
                </defs>

                {/* ── SOFT BACKGROUND BLOBS ── */}
                <ellipse cx="320" cy="290" rx="240" ry="180" fill="rgba(255,255,255,0.18)"/>
                <ellipse cx="180" cy="200" rx="120" ry="90" fill="rgba(255,200,150,0.1)"/>

                {/* ════ TABLE — isometric platform ════ */}
                {/* Top face */}
                <polygon points="90,230 310,110 530,230 310,350" fill="url(#gTable)" filter="url(#sf)"/>
                {/* Left face */}
                <polygon points="90,230 310,350 310,410 90,290" fill="#DEB870"/>
                {/* Right face */}
                <polygon points="530,230 310,350 310,410 530,290" fill="#C8A050"/>
                {/* Table edge highlight */}
                <polygon points="90,230 310,110 530,230 310,350" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"/>
                {/* Legs */}
                <rect x="145" y="396" width="12" height="55" rx="6" fill="#C8A050"/>
                <rect x="455" y="396" width="12" height="55" rx="6" fill="#C8A050"/>
                <rect x="255" y="428" width="12" height="30" rx="6" fill="#C8A050"/>
                <rect x="343" y="428" width="12" height="30" rx="6" fill="#C8A050"/>

                {/* ════ BIRYANI BOWL (centre-right of table) ════ */}
                {/* Shadow */}
                <ellipse cx="370" cy="308" rx="62" ry="20" fill="rgba(160,90,30,0.2)"/>
                {/* Bowl body */}
                <path d="M308,255 C308,255 305,310 370,315 C435,310 432,255 432,255 C432,230 402,218 370,218 C338,218 308,230 308,255Z" fill="url(#gBowl)" filter="url(#sf2)"/>
                {/* Bowl rim */}
                <ellipse cx="370" cy="252" rx="62" ry="22" fill="#F5AA7A"/>
                {/* Rice / biryani surface */}
                <ellipse cx="370" cy="246" rx="55" ry="18" fill="#F4D070"/>
                {/* Texture lumps */}
                <ellipse cx="350" cy="242" rx="13" ry="5" fill="#E8C040" opacity="0.8"/>
                <ellipse cx="382" cy="244" rx="11" ry="4" fill="#F0D060" opacity="0.9"/>
                <ellipse cx="362" cy="250" rx="9" ry="3.5" fill="#D4A820" opacity="0.7"/>
                <ellipse cx="390" cy="240" rx="8" ry="3" fill="#ECC040" opacity="0.8"/>
                {/* Herb garnish */}
                <ellipse cx="372" cy="238" rx="11" ry="5" fill="#6AB090" opacity="0.95"/>
                <ellipse cx="355" cy="243" rx="6" ry="3" fill="#5A9A78" opacity="0.8"/>
                {/* Saffron */}
                <ellipse cx="385" cy="248" rx="5" ry="2" fill="#E05A3A" opacity="0.7"/>
                {/* Steam wisps */}
                <path d="M355,215 Q349,198 357,182 Q363,168 357,154" stroke="rgba(255,255,255,0.55)" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                <path d="M375,210 Q369,192 378,176 Q385,162 379,148" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" fill="none"/>
                <path d="M393,216 Q387,200 395,185 Q401,172 396,158" stroke="rgba(255,255,255,0.35)" strokeWidth="1.8" strokeLinecap="round" fill="none"/>

                {/* ════ SALAD BOWL (left of table) ════ */}
                <ellipse cx="215" cy="272" rx="50" ry="16" fill="rgba(160,90,30,0.15)"/>
                <path d="M165,228 C165,228 162,270 215,274 C268,270 265,228 265,228 C265,208 242,198 215,198 C188,198 165,208 165,228Z" fill="#8FC4A8" filter="url(#sf2)"/>
                <ellipse cx="215" cy="226" rx="50" ry="18" fill="#AAD4BC"/>
                {/* Salad contents */}
                <ellipse cx="215" cy="220" rx="43" ry="14" fill="#6AB090"/>
                <ellipse cx="200" cy="216" rx="12" ry="5" fill="#4A8A68" opacity="0.85"/>
                <ellipse cx="228" cy="218" rx="10" ry="4" fill="#F4A0B0" opacity="0.9"/>
                <ellipse cx="212" cy="224" rx="8" ry="3" fill="#F4D070" opacity="0.85"/>
                <ellipse cx="232" cy="213" rx="7" ry="3" fill="#80B898" opacity="0.9"/>
                <circle cx="218" cy="212" r="4" fill="#E05A3A" opacity="0.7"/>

                {/* ════ PHONE with AR ════ */}
                <ellipse cx="168" cy="198" rx="28" ry="9" fill="rgba(0,0,0,0.1)"/>
                {/* Phone body */}
                <rect x="142" y="105" width="52" height="93" rx="10" fill="#1E1B18" filter="url(#sf2)"/>
                {/* Screen */}
                <rect x="148" y="113" width="40" height="68" rx="6" fill="#1A2A4A"/>
                {/* Screen glow */}
                <rect x="148" y="113" width="40" height="68" rx="6" fill="url(#screenGlow)" opacity="0.4"/>
                {/* AR UI on screen */}
                <rect x="153" y="118" width="30" height="16" rx="3" fill="rgba(100,200,255,0.25)"/>
                <text x="168" y="129" textAnchor="middle" fill="rgba(100,220,255,0.9)" fontSize="7" fontWeight="700">AR VIEW</text>
                {/* Hologram food on screen */}
                <ellipse cx="168" cy="154" rx="13" ry="9" fill="rgba(244,168,106,0.45)"/>
                <rect x="157" y="144" width="22" height="10" rx="5" fill="rgba(224,90,58,0.55)"/>
                <ellipse cx="168" cy="144" rx="13" ry="6" fill="rgba(255,220,140,0.7)"/>
                {/* UI lines */}
                <line x1="153" y1="165" x2="188" y2="165" stroke="rgba(100,200,255,0.3)" strokeWidth="1.5"/>
                <line x1="153" y1="170" x2="180" y2="170" stroke="rgba(100,200,255,0.25)" strokeWidth="1.5"/>
                <line x1="153" y1="175" x2="172" y2="175" stroke="rgba(100,200,255,0.2)" strokeWidth="1.5"/>
                {/* Home bar */}
                <rect x="160" y="193" width="18" height="2.5" rx="1.25" fill="rgba(255,255,255,0.18)"/>

                {/* ════ AR HOLOGRAM floating above phone ════ */}
                <g opacity="0.9">
                  {/* Hologram base ring */}
                  <ellipse cx="205" cy="88" rx="30" ry="11" fill="rgba(100,210,255,0.12)" stroke="rgba(100,210,255,0.45)" strokeWidth="1.2"/>
                  {/* Mini burger hologram */}
                  <ellipse cx="205" cy="78" rx="18" ry="7" fill="rgba(244,168,106,0.75)"/>
                  <rect x="188" y="67" width="34" height="11" rx="5.5" fill="rgba(140,70,30,0.65)"/>
                  <rect x="186" y="62" width="38" height="7" rx="3.5" fill="rgba(100,180,120,0.7)"/>
                  <ellipse cx="205" cy="62" rx="20" ry="8" fill="rgba(255,210,120,0.85)"/>
                  {/* Hologram scan lines */}
                  <line x1="176" y1="88" x2="176" y2="58" stroke="rgba(100,210,255,0.5)" strokeWidth="1" strokeDasharray="3,3"/>
                  <line x1="234" y1="88" x2="234" y2="58" stroke="rgba(100,210,255,0.5)" strokeWidth="1" strokeDasharray="3,3"/>
                  {/* Beam lines to phone */}
                  <line x1="176" y1="88" x2="158" y2="125" stroke="rgba(100,210,255,0.25)" strokeWidth="0.8"/>
                  <line x1="234" y1="88" x2="188" y2="125" stroke="rgba(100,210,255,0.25)" strokeWidth="0.8"/>
                  {/* Sparkle around hologram */}
                  <circle cx="170" cy="55" r="3" fill="rgba(100,210,255,0.6)"/>
                  <circle cx="240" cy="70" r="2" fill="rgba(100,210,255,0.5)"/>
                  <circle cx="215" cy="42" r="2.5" fill="rgba(100,210,255,0.55)"/>
                </g>

                {/* ════ PLANT POT (right side of table) ════ */}
                {/* Pot */}
                <path d="M458,318 L452,352 Q452,358 465,360 Q478,360 484,360 Q497,360 497,352 L491,318Z" fill="#F4A0B0" filter="url(#sf2)"/>
                <rect x="450" y="314" width="48" height="9" rx="4.5" fill="#FFBCC8"/>
                {/* Soil */}
                <ellipse cx="474" cy="314" rx="24" ry="7" fill="#8B6040"/>
                {/* Leaves */}
                <ellipse cx="474" cy="294" rx="22" ry="17" fill="url(#gGreen)"/>
                <ellipse cx="458" cy="282" rx="15" ry="12" fill="#5A9A78"/>
                <ellipse cx="490" cy="285" rx="13" ry="10" fill="#4A8A68"/>
                <ellipse cx="472" cy="275" rx="11" ry="9" fill="#6AB090"/>
                <ellipse cx="484" cy="278" rx="9" ry="8" fill="#80AA90"/>

                {/* ════ QR CODE CARD ════ */}
                <rect x="432" y="160" width="68" height="68" rx="12" fill="rgba(255,248,232,0.92)" filter="url(#sf)"/>
                {/* QR top-left block */}
                <rect x="440" y="168" width="20" height="20" rx="2.5" fill="#1E1B18"/>
                <rect x="443" y="171" width="14" height="14" rx="1.5" fill="rgba(255,248,232,0.92)"/>
                <rect x="446" y="174" width="8" height="8" rx="1" fill="#1E1B18"/>
                {/* QR top-right block */}
                <rect x="468" y="168" width="20" height="20" rx="2.5" fill="#1E1B18"/>
                <rect x="471" y="171" width="14" height="14" rx="1.5" fill="rgba(255,248,232,0.92)"/>
                <rect x="474" y="174" width="8" height="8" rx="1" fill="#1E1B18"/>
                {/* QR bottom-left block */}
                <rect x="440" y="196" width="20" height="20" rx="2.5" fill="#1E1B18"/>
                <rect x="443" y="199" width="14" height="14" rx="1.5" fill="rgba(255,248,232,0.92)"/>
                <rect x="446" y="202" width="8" height="8" rx="1" fill="#1E1B18"/>
                {/* QR data dots */}
                <rect x="468" y="196" width="6" height="6" rx="1" fill="#1E1B18"/>
                <rect x="476" y="196" width="6" height="6" rx="1" fill="#1E1B18"/>
                <rect x="484" y="196" width="6" height="6" rx="1" fill="#1E1B18"/>
                <rect x="468" y="204" width="6" height="6" rx="1" fill="#1E1B18"/>
                <rect x="484" y="204" width="6" height="6" rx="1" fill="#1E1B18"/>
                <rect x="476" y="212" width="6" height="6" rx="1" fill="#1E1B18"/>
                <rect x="484" y="212" width="6" height="6" rx="1" fill="#1E1B18"/>
                {/* Scan text */}
                <text x="466" y="242" textAnchor="middle" fill="#C04A28" fontSize="8.5" fontWeight="700" fontFamily="Inter,sans-serif">SCAN ME</text>

                {/* ════ FLOATING FOOD — Pizza slice (top right) ════ */}
                <g transform="translate(480,62) rotate(-18)">
                  <polygon points="0,0 44,16 22,54" fill="#F5A876" filter="url(#sf2)"/>
                  <polygon points="0,0 44,16 38,8" fill="#E07850"/>
                  {/* Cheese */}
                  <circle cx="22" cy="26" r="6" fill="#F4D070"/>
                  <circle cx="31" cy="38" r="5" fill="#F4D070"/>
                  <circle cx="14" cy="38" r="4" fill="#F4D070"/>
                  {/* Toppings */}
                  <circle cx="16" cy="28" r="3.5" fill="#C04A28"/>
                  <circle cx="28" cy="20" r="3" fill="#C04A28"/>
                  <circle cx="26" cy="40" r="3" fill="#C04A28"/>
                </g>

                {/* ════ FLOATING FOOD — Burger (top centre) ════ */}
                <g transform="translate(300,38)" filter="url(#sf2)">
                  <ellipse cx="0" cy="32" rx="24" ry="8" fill="#E8A060"/>
                  <rect x="-22" y="22" width="44" height="11" rx="5.5" fill="#7A4020"/>
                  <rect x="-24" y="17" width="48" height="7" rx="3.5" fill="#80C090"/>
                  <rect x="-22" y="11" width="44" height="8" rx="4" fill="#C04A28" opacity="0.8"/>
                  <ellipse cx="0" cy="10" rx="24" ry="10" fill="#F4C060"/>
                  <ellipse cx="-7" cy="6" rx="4" ry="1.8" fill="#D4A030" transform="rotate(-20,-7,6)"/>
                  <ellipse cx="7" cy="5" rx="4" ry="1.8" fill="#D4A030" transform="rotate(20,7,5)"/>
                  <ellipse cx="0" cy="4" rx="4" ry="1.8" fill="#D4A030"/>
                </g>

                {/* ════ FLOATING FOOD — Noodle bowl (top left) ════ */}
                <g transform="translate(78,118)" filter="url(#sf2)">
                  <ellipse cx="0" cy="16" rx="30" ry="10" fill="rgba(120,70,30,0.12)"/>
                  <path d="M-30,0 C-30,0 -30,28 0,30 C30,28 30,0 30,0 C30,-14 16,-18 0,-18 C-16,-18 -30,-14 -30,0Z" fill="#F4A0B0"/>
                  <ellipse cx="0" cy="0" rx="30" ry="11" fill="#FFBCC8"/>
                  <path d="M-18,-3 Q-4,7 12,-2 Q22,-9 20,4" stroke="#F4D070" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
                  <path d="M-12,3 Q2,12 18,3" stroke="#F4D070" strokeWidth="3" fill="none" strokeLinecap="round"/>
                  <circle cx="2" cy="-4" r="5.5" fill="#C04A28" opacity="0.8"/>
                  <circle cx="-10" cy="3" r="4" fill="#8FC4A8" opacity="0.9"/>
                  <circle cx="10" cy="6" r="3.5" fill="#F4D070" opacity="0.85"/>
                </g>

                {/* ════ DECORATIVE DOTS ════ */}
                <circle cx="100" cy="80" r="5" fill="#F4D070" opacity="0.75"/>
                <circle cx="106" cy="73" r="3" fill="#F4D070" opacity="0.5"/>
                <circle cx="540" cy="170" r="6" fill="#C4B5D4" opacity="0.7"/>
                <circle cx="548" cy="182" r="3.5" fill="#C4B5D4" opacity="0.5"/>
                <circle cx="130" cy="310" r="4" fill="#F4A0B0" opacity="0.65"/>
                <circle cx="522" cy="320" r="5" fill="#8FC4A8" opacity="0.6"/>
                <circle cx="84" cy="175" r="3" fill="#E05A3A" opacity="0.4"/>
                {/* Star sparkle top-right */}
                <g transform="translate(548,100)" fill="#F4D070" opacity="0.7">
                  <polygon points="0,-8 2,-2 8,0 2,2 0,8 -2,2 -8,0 -2,-2"/>
                </g>
                <g transform="translate(110,400)" fill="#F4A0B0" opacity="0.65">
                  <polygon points="0,-6 1.5,-1.5 6,0 1.5,1.5 0,6 -1.5,1.5 -6,0 -1.5,-1.5"/>
                </g>
              </svg>
            </div>

          </div>
        </section>

        {/* DEMO */}
        <section style={{padding:'0 24px 72px',position:'relative',zIndex:1}}>
          <div style={{maxWidth:860,margin:'0 auto',background:'rgba(255,245,225,0.7)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',border:'1.5px solid rgba(255,215,155,0.55)',borderRadius:28,overflow:'hidden',boxShadow:'0 24px 64px rgba(120,70,30,0.18),inset 0 1px 0 rgba(255,255,255,0.7)'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'13px 18px',borderBottom:'1px solid rgba(200,140,80,0.2)',background:'rgba(255,240,210,0.5)'}}>
              <div style={{display:'flex',gap:5}}>{['#FF5F57','#FEBC2E','#28C840'].map(c=><span key={c} style={{width:10,height:10,borderRadius:'50%',background:c,opacity:0.8}}/>)}</div>
              <div style={{flex:1,display:'flex',justifyContent:'center'}}>
                <div style={{padding:'4px 16px',background:'rgba(255,255,255,0.5)',borderRadius:8,fontSize:12,color:'rgba(42,31,16,0.5)',fontFamily:'monospace',border:'1px solid rgba(200,140,80,0.2)'}}>spot.advertradical.com</div>
              </div>
            </div>
            <div style={{padding:'28px 24px'}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:22}}>
                <div style={{width:44,height:44,borderRadius:14,background:'linear-gradient(135deg,rgba(224,90,58,0.2),rgba(244,168,106,0.15))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,border:'1.5px solid rgba(224,90,58,0.2)'}}>🍜</div>
                <div>
                  <div style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:16,color:'#2A1F10'}}>Spot Restaurant</div>
                  <div style={{fontSize:12,color:'rgba(42,31,16,0.45)',marginTop:2}}>Bengaluru, Karnataka</div>
                </div>
                <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,padding:'5px 13px',borderRadius:20,background:'rgba(224,90,58,0.12)',border:'1.5px solid rgba(224,90,58,0.25)',fontSize:11,fontWeight:700,color:'#C04A28'}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:'#E05A3A'}}/>AR Enabled
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
                {[['🍗','Butter Chicken','₹320'],['🍛','Biryani','₹280'],['🧀','Paneer Tikka','₹250'],['🥘','Dal Makhani','₹180'],['🍬','Gulab Jamun','₹90'],['🥛','Lassi','₹80']].map(([em,name,price])=>(
                  <div key={name} style={{background:'rgba(255,255,255,0.55)',border:'1.5px solid rgba(255,215,155,0.5)',borderRadius:18,padding:'14px 12px',textAlign:'center',backdropFilter:'blur(8px)',boxShadow:'0 4px 14px rgba(120,70,30,0.08)',transition:'all 0.2s'}}>
                    <div style={{width:58,height:58,borderRadius:'50%',background:'rgba(255,240,210,0.8)',margin:'0 auto 10px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,border:'2px solid rgba(255,215,155,0.5)',boxShadow:'0 4px 12px rgba(120,70,30,0.1)'}}>{em}</div>
                    <div style={{fontSize:12,fontWeight:600,color:'#2A1F10',marginBottom:3}}>{name}</div>
                    <div style={{fontSize:11,color:'#C04A28',fontWeight:700}}>{price}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="section" style={{background:'rgba(255,255,255,0.15)',backdropFilter:'blur(8px)',borderTop:'1px solid rgba(255,215,155,0.3)',borderBottom:'1px solid rgba(255,215,155,0.3)'}}>
          <div className="inner">
            <div style={{textAlign:'center',marginBottom:48}}>
              <h2 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:'clamp(28px,4vw,44px)',color:'#1E1B18',marginBottom:12}}>Everything your restaurant needs</h2>
              <p style={{fontSize:16,color:'rgba(42,31,16,0.55)'}}>One platform. Full AR experience.</p>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))',gap:14}}>
              {features.map(f=>(
                <div key={f.title} className="cc" style={{padding:28}}>
                  <div style={{fontSize:30,marginBottom:14}}>{f.icon}</div>
                  <h3 style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:16,color:'#1E1B18',marginBottom:8}}>{f.title}</h3>
                  <p style={{fontSize:13.5,color:'rgba(42,31,16,0.55)',lineHeight:1.7}}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PLANS */}
        <section id="plans" className="section">
          <div className="inner">
            <div style={{textAlign:'center',marginBottom:48}}>
              <h2 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:'clamp(28px,4vw,44px)',color:'#1E1B18',marginBottom:12}}>Simple pricing</h2>
              <p style={{fontSize:16,color:'rgba(42,31,16,0.55)'}}>6-month subscriptions. Cancel anytime.</p>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(265px,1fr))',gap:16,maxWidth:900,margin:'0 auto'}}>
              {plans.map(p=>(
                <div key={p.name} className={`pc${p.tag==='Popular'?' pop':''}`}>
                  {p.tag && <div style={{position:'absolute',top:-14,left:'50%',transform:'translateX(-50%)',padding:'5px 18px',background:'linear-gradient(135deg,#E05A3A,#F07050)',color:'#fff',fontSize:11,fontWeight:700,borderRadius:30,whiteSpace:'nowrap',boxShadow:'0 4px 16px rgba(224,90,58,0.35)'}}>✦ {p.tag}</div>}
                  <div style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:18,color:'#1E1B18',marginBottom:6}}>{p.name}</div>
                  <div style={{display:'flex',alignItems:'baseline',gap:4,marginBottom:22}}>
                    <span style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:34,color:'#1E1B18'}}>{p.price}</span>
                    <span style={{fontSize:13,color:'rgba(42,31,16,0.45)'}}>{p.per}</span>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:11,marginBottom:26}}>
                    {[`${p.items} AR menu items`,`${p.storage} storage`,'Analytics dashboard','QR code generator','Subdomain included'].map(f=>(
                      <div key={f} style={{display:'flex',alignItems:'center',gap:9,fontSize:13.5,color:'rgba(42,31,16,0.7)'}}>
                        <span style={{width:18,height:18,borderRadius:6,background:'rgba(224,90,58,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#E05A3A',fontWeight:700,flexShrink:0}}>✓</span>
                        {f}
                      </div>
                    ))}
                  </div>
                  <button className={p.tag==='Popular'?'btn-coral':'btn-ghost'} style={{width:'100%',padding:'13px',borderRadius:14,fontSize:14,fontFamily:'Poppins,sans-serif',fontWeight:700}}>Get Started</button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{borderTop:'1px solid rgba(200,140,80,0.2)',padding:'24px',background:'rgba(255,240,210,0.3)',backdropFilter:'blur(8px)',position:'relative',zIndex:1}}>
          <div className="inner" style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
            <span style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:15,color:'#1E1B18'}}>
              Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F4A86A)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
            </span>
            <span style={{fontSize:13,color:'rgba(42,31,16,0.4)'}}>© {new Date().getFullYear()} Advert Radical. All rights reserved.</span>
            <div style={{display:'flex',gap:20}}>
              {['Privacy','Terms'].map(l=><a key={l} href="#" style={{fontSize:13,color:'rgba(42,31,16,0.4)'}}>{l}</a>)}
              <Link href="/admin/login" style={{fontSize:13,color:'rgba(42,31,16,0.4)'}}>Login</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
