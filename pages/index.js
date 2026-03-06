import Head from 'next/head';
import Link from 'next/link';

const plans = [
  { name:'Basic',   price:'₹999',   per:'/6 months', items:10,  storage:'500MB', tag:null },
  { name:'Pro',     price:'₹2,499', per:'/6 months', items:40,  storage:'2GB',   tag:'Popular' },
  { name:'Premium', price:'₹4,999', per:'/6 months', items:100, storage:'5GB',   tag:'Best Value' },
];

export default function HomePage() {
  return (
    <>
      <Head>
        <title>Advert Radical — AR Menus for Restaurants</title>
        <meta name="description" content="Give your restaurant an AR-powered menu. Customers scan, see food in 3D."/>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
      </Head>

      <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#F5A876 0%,#F0906A 45%,#C8A8D8 100%)',fontFamily:'Inter,sans-serif',color:'#2A1F10',overflowX:'hidden',position:'relative'}}>
        <style>{`
          *{box-sizing:border-box;margin:0;padding:0} a{text-decoration:none}
          @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-11px)}}
          @keyframes floatR{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-8px) rotate(6deg)}}
          @keyframes fadeUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
          @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
          .float{animation:float 5s ease-in-out infinite}
          .float2{animation:float 7s ease-in-out 1.8s infinite}
          .floatR{animation:floatR 6s ease-in-out 0.7s infinite}

          /* NAV */
          .nav{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:50;
            background:rgba(255,248,232,0.82);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
            border:1.5px solid rgba(255,220,160,0.55);border-radius:50px;
            padding:9px 20px 9px 20px;display:flex;align-items:center;gap:6px;
            box-shadow:0 6px 28px rgba(120,70,30,0.13),inset 0 1px 0 rgba(255,255,255,0.65);
            width:calc(100% - 40px);max-width:820px;}
          .nlnk{font-size:14px;color:rgba(42,31,16,0.55);font-weight:500;transition:color 0.15s;padding:6px 14px;border-radius:30px;}
          .nlnk:hover{color:#2A1F10;background:rgba(255,255,255,0.3);}

          /* Clay card */
          .cc{background:rgba(255,248,230,0.75);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
            border:1.5px solid rgba(255,215,155,0.5);border-radius:22px;
            box-shadow:0 6px 24px rgba(120,70,30,0.1),inset 0 1px 0 rgba(255,255,255,0.7);
            transition:all 0.22s cubic-bezier(0.34,1.56,0.64,1);}
          .cc:hover{transform:translateY(-5px);box-shadow:0 18px 44px rgba(120,70,30,0.17);}

          /* Plan card */
          .pc{background:rgba(255,248,230,0.78);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
            border:1.5px solid rgba(255,215,155,0.5);border-radius:24px;padding:32px;position:relative;
            box-shadow:0 6px 24px rgba(120,70,30,0.1),inset 0 1px 0 rgba(255,255,255,0.7);
            transition:all 0.22s;}
          .pc.pop{border-color:rgba(224,90,58,0.45);box-shadow:0 10px 36px rgba(224,90,58,0.18);}
          .pc:hover{transform:translateY(-4px);}

          /* Buttons */
          .btn-dark{background:#1E1B18;color:#FFF5E8;border:none;border-radius:50px;
            font-family:Poppins,sans-serif;font-weight:700;cursor:pointer;transition:all 0.2s;
            box-shadow:0 6px 20px rgba(30,27,24,0.3);}
          .btn-dark:hover{background:#2E2B28;transform:translateY(-2px);}

          .btn-outline{background:rgba(255,255,255,0.55);color:#1E1B18;border:1.5px solid rgba(42,31,16,0.2);
            border-radius:50px;font-weight:600;cursor:pointer;transition:all 0.2s;
            font-family:Poppins,sans-serif;backdrop-filter:blur(8px);}
          .btn-outline:hover{background:rgba(255,255,255,0.82);}

          .btn-coral{background:linear-gradient(135deg,#E05A3A,#F07050);color:#fff;border:none;border-radius:14px;
            font-family:Poppins,sans-serif;font-weight:700;cursor:pointer;transition:all 0.2s;
            box-shadow:0 8px 24px rgba(224,90,58,0.35);}
          .btn-coral:hover{transform:translateY(-2px);box-shadow:0 14px 32px rgba(224,90,58,0.45);}

          .inner{max-width:1080px;margin:0 auto;padding:0 32px;}
          .section{padding:80px 0;position:relative;z-index:1;}
          /* Split layout */
          .split{display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:56px;}
          .split.rev{direction:rtl;} .split.rev > *{direction:ltr;}
          .feat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
          .plan-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:920px;margin:0 auto;}
          @media(max-width:960px){
            .feat-grid{grid-template-columns:repeat(2,1fr)!important;}
            .plan-grid{grid-template-columns:repeat(2,1fr)!important;}
          }
          @media(max-width:680px){
            .split{grid-template-columns:1fr!important;gap:32px;}
            .split.rev{direction:ltr;}
            .feat-grid{grid-template-columns:1fr!important;}
            .plan-grid{grid-template-columns:1fr!important;}
          }
        `}</style>

        {/* Background blobs — subtle, not cluttered */}
        <div style={{position:'fixed',bottom:'-15%',right:'-6%',width:480,height:480,borderRadius:'50%',background:'rgba(255,255,255,0.1)',pointerEvents:'none',zIndex:0}}/>
        <div style={{position:'fixed',top:'-10%',left:'-5%',width:360,height:360,borderRadius:'50%',background:'rgba(255,255,255,0.08)',pointerEvents:'none',zIndex:0}}/>

        {/* ══ NAV ══ */}
        <nav className="nav">
          <span style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:16,color:'#1E1B18',flexShrink:0,marginRight:8}}>
            Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F4A86A)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
          </span>
          <div style={{flex:1}}/>
          <a href="#features" className="nlnk">Features</a>
          <a href="#how" className="nlnk">How it works</a>
          <a href="#plans" className="nlnk">Pricing</a>
          <Link href="/admin/login" className="nlnk">Sign in</Link>
          <Link href="/admin/login" style={{marginLeft:6,padding:'9px 20px',background:'#1E1B18',color:'#FFF5E8',borderRadius:30,fontSize:13,fontWeight:700,letterSpacing:'0.01em',boxShadow:'0 4px 14px rgba(30,27,24,0.25)'}}>Get Started</Link>
        </nav>

        {/* ══ HERO ══ */}
        <section style={{paddingTop:108,paddingBottom:32,position:'relative',zIndex:1}}>
          <div className="inner">
            <div className="split">

              {/* LEFT — clean, minimal */}
              <div style={{animation:'fadeUp 0.8s ease forwards'}}>
                <div style={{display:'inline-flex',alignItems:'center',gap:7,padding:'6px 14px',borderRadius:30,background:'rgba(255,255,255,0.5)',border:'1px solid rgba(255,215,155,0.6)',fontSize:12,fontWeight:600,color:'#8B4020',marginBottom:24,letterSpacing:'0.02em'}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:'#E05A3A',animation:'blink 2s infinite'}}/>
                  AR-Powered Restaurant Menus
                </div>

                <h1 style={{fontFamily:'Poppins,sans-serif',fontWeight:900,fontSize:'clamp(40px,4.8vw,66px)',lineHeight:1.04,letterSpacing:'-0.03em',color:'#1E1B18',marginBottom:20}}>
                  Your menu,<br/>
                  <span style={{background:'linear-gradient(135deg,#E05A3A,#F07050)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>alive in 3D</span>
                </h1>

                <p style={{fontSize:17,color:'rgba(42,31,16,0.58)',lineHeight:1.7,marginBottom:36,maxWidth:420}}>
                  Customers scan your QR code, point at the table, and watch food appear in augmented reality. No app needed.
                </p>

                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:40}}>
                  <Link href="/admin/login">
                    <button className="btn-dark" style={{padding:'14px 28px',fontSize:15}}>Get Started Free</button>
                  </Link>
                  <a href="#how">
                    <button className="btn-outline" style={{padding:'14px 24px',fontSize:15}}>See how it works</button>
                  </a>
                </div>

                <div style={{display:'flex',alignItems:'center',gap:16,paddingTop:20,borderTop:'1px solid rgba(42,31,16,0.1)'}}>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:22,color:'#1E1B18'}}>500+</div>
                    <div style={{fontSize:12,color:'rgba(42,31,16,0.5)',marginTop:2}}>Restaurants</div>
                  </div>
                  <div style={{width:1,height:32,background:'rgba(42,31,16,0.12)'}}/>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:22,color:'#1E1B18'}}>50k+</div>
                    <div style={{fontSize:12,color:'rgba(42,31,16,0.5)',marginTop:2}}>AR Views / month</div>
                  </div>
                  <div style={{width:1,height:32,background:'rgba(42,31,16,0.12)'}}/>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:22,color:'#1E1B18'}}>4.9★</div>
                    <div style={{fontSize:12,color:'rgba(42,31,16,0.5)',marginTop:2}}>Avg rating</div>
                  </div>
                </div>
              </div>

              {/* RIGHT — 3D Clay Food Scene */}
              <div style={{position:'relative',animation:'fadeUp 1s ease 0.15s both'}}>
                <div style={{position:'absolute',top:'8%',left:'8%',right:'8%',bottom:'5%',background:'radial-gradient(ellipse,rgba(255,255,255,0.32),transparent 68%)',filter:'blur(18px)',borderRadius:'50%',pointerEvents:'none'}}/>
                <svg viewBox="0 0 580 500" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'auto',filter:'drop-shadow(0 20px 44px rgba(120,70,30,0.2))',position:'relative'}}>
                  <defs>
                    <filter id="sf"><feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="rgba(120,70,30,0.16)"/></filter>
                    <filter id="sf2"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="rgba(120,70,30,0.12)"/></filter>
                    <radialGradient id="gT" cx="50%" cy="40%"><stop offset="0%" stopColor="#FFF5DC"/><stop offset="100%" stopColor="#F4D898"/></radialGradient>
                    <radialGradient id="gB" cx="35%" cy="30%"><stop offset="0%" stopColor="#FFECD0"/><stop offset="100%" stopColor="#E8906A"/></radialGradient>
                    <radialGradient id="gG" cx="35%" cy="30%"><stop offset="0%" stopColor="#B8E4CC"/><stop offset="100%" stopColor="#5A9A78"/></radialGradient>
                  </defs>
                  {/* bg blobs */}
                  <ellipse cx="310" cy="285" rx="230" ry="172" fill="rgba(255,255,255,0.15)"/>
                  {/* TABLE */}
                  <polygon points="90,228 310,108 530,228 310,348" fill="url(#gT)" filter="url(#sf)"/>
                  <polygon points="90,228 310,348 310,408 90,288" fill="#DEB870"/>
                  <polygon points="530,228 310,348 310,408 530,288" fill="#C8A050"/>
                  <polygon points="90,228 310,108 530,228 310,348" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5"/>
                  <rect x="145" y="394" width="11" height="52" rx="5.5" fill="#C8A050"/>
                  <rect x="456" y="394" width="11" height="52" rx="5.5" fill="#C8A050"/>
                  <rect x="254" y="426" width="11" height="28" rx="5.5" fill="#C8A050"/>
                  <rect x="344" y="426" width="11" height="28" rx="5.5" fill="#C8A050"/>
                  {/* BIRYANI BOWL */}
                  <ellipse cx="368" cy="306" rx="60" ry="19" fill="rgba(160,90,30,0.18)"/>
                  <path d="M308,253 C308,253 305,308 368,313 C431,308 428,253 428,253 C428,229 400,217 368,217 C336,217 308,229 308,253Z" fill="url(#gB)" filter="url(#sf2)"/>
                  <ellipse cx="368" cy="250" rx="60" ry="21" fill="#F5AA7A"/>
                  <ellipse cx="368" cy="244" rx="53" ry="17" fill="#F4D070"/>
                  <ellipse cx="350" cy="240" rx="12" ry="4.5" fill="#E8C040" opacity="0.85"/>
                  <ellipse cx="381" cy="242" rx="10" ry="4" fill="#F0D060" opacity="0.9"/>
                  <ellipse cx="362" cy="248" rx="9" ry="3.5" fill="#D4A820" opacity="0.7"/>
                  <ellipse cx="370" cy="236" rx="10" ry="4.5" fill="#6AB090" opacity="0.95"/>
                  <ellipse cx="354" cy="241" rx="6" ry="2.8" fill="#5A9A78" opacity="0.8"/>
                  <ellipse cx="383" cy="246" rx="5" ry="2" fill="#E05A3A" opacity="0.7"/>
                  <path d="M354,213 Q348,196 356,180 Q362,166 356,152" stroke="rgba(255,255,255,0.5)" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
                  <path d="M373,208 Q367,190 376,174 Q383,160 377,146" stroke="rgba(255,255,255,0.38)" strokeWidth="2" strokeLinecap="round" fill="none"/>
                  <path d="M391,214 Q385,198 393,183 Q399,170 394,156" stroke="rgba(255,255,255,0.3)" strokeWidth="1.7" strokeLinecap="round" fill="none"/>
                  {/* SALAD BOWL */}
                  <ellipse cx="214" cy="270" rx="48" ry="15" fill="rgba(160,90,30,0.13)"/>
                  <path d="M166,226 C166,226 163,268 214,272 C265,268 262,226 262,226 C262,207 240,197 214,197 C188,197 166,207 166,226Z" fill="#8FC4A8" filter="url(#sf2)"/>
                  <ellipse cx="214" cy="224" rx="48" ry="17" fill="#AAD4BC"/>
                  <ellipse cx="214" cy="218" rx="41" ry="13" fill="#6AB090"/>
                  <ellipse cx="200" cy="214" rx="11" ry="4.5" fill="#4A8A68" opacity="0.85"/>
                  <ellipse cx="226" cy="216" rx="9" ry="3.5" fill="#F4A0B0" opacity="0.9"/>
                  <ellipse cx="212" cy="222" rx="8" ry="3" fill="#F4D070" opacity="0.85"/>
                  <circle cx="217" cy="210" r="4" fill="#E05A3A" opacity="0.75"/>
                  {/* PHONE */}
                  <ellipse cx="166" cy="196" rx="27" ry="8.5" fill="rgba(0,0,0,0.09)"/>
                  <rect x="141" y="103" width="50" height="91" rx="10" fill="#1E1B18" filter="url(#sf2)"/>
                  <rect x="147" y="111" width="38" height="65" rx="6" fill="#1A2A4A"/>
                  <rect x="152" y="116" width="28" height="15" rx="3" fill="rgba(100,200,255,0.22)"/>
                  <text x="166" y="127" textAnchor="middle" fill="rgba(100,220,255,0.9)" fontSize="6.5" fontWeight="700">AR VIEW</text>
                  <ellipse cx="166" cy="151" rx="12" ry="8" fill="rgba(244,168,106,0.45)"/>
                  <rect x="155" y="142" width="21" height="9" rx="4.5" fill="rgba(224,90,58,0.52)"/>
                  <ellipse cx="166" cy="142" rx="12" ry="5.5" fill="rgba(255,220,140,0.7)"/>
                  <line x1="152" y1="163" x2="186" y2="163" stroke="rgba(100,200,255,0.28)" strokeWidth="1.4"/>
                  <line x1="152" y1="168" x2="178" y2="168" stroke="rgba(100,200,255,0.22)" strokeWidth="1.4"/>
                  <line x1="152" y1="173" x2="170" y2="173" stroke="rgba(100,200,255,0.18)" strokeWidth="1.4"/>
                  <rect x="158" y="190" width="16" height="2" rx="1" fill="rgba(255,255,255,0.16)"/>
                  {/* HOLOGRAM */}
                  <g opacity="0.88">
                    <ellipse cx="202" cy="86" rx="28" ry="10" fill="rgba(100,210,255,0.1)" stroke="rgba(100,210,255,0.42)" strokeWidth="1.1"/>
                    <ellipse cx="202" cy="76" rx="17" ry="6.5" fill="rgba(244,168,106,0.72)"/>
                    <rect x="186" y="65" width="32" height="10" rx="5" fill="rgba(140,70,30,0.62)"/>
                    <rect x="184" y="60" width="36" height="7" rx="3.5" fill="rgba(100,180,120,0.68)"/>
                    <ellipse cx="202" cy="60" rx="19" ry="7.5" fill="rgba(255,210,120,0.84)"/>
                    <line x1="175" y1="86" x2="157" y2="122" stroke="rgba(100,210,255,0.22)" strokeWidth="0.8"/>
                    <line x1="229" y1="86" x2="186" y2="122" stroke="rgba(100,210,255,0.22)" strokeWidth="0.8"/>
                    <circle cx="168" cy="53" r="2.8" fill="rgba(100,210,255,0.58)"/>
                    <circle cx="237" cy="68" r="1.9" fill="rgba(100,210,255,0.48)"/>
                    <circle cx="212" cy="40" r="2.2" fill="rgba(100,210,255,0.52)"/>
                  </g>
                  {/* PLANT */}
                  <path d="M456,316 L450,350 Q450,356 463,358 Q476,358 482,358 Q495,358 495,350 L489,316Z" fill="#F4A0B0" filter="url(#sf2)"/>
                  <rect x="448" y="312" width="46" height="8" rx="4" fill="#FFBCC8"/>
                  <ellipse cx="472" cy="312" rx="23" ry="6.5" fill="#8B6040"/>
                  <ellipse cx="472" cy="292" rx="21" ry="16" fill="url(#gG)"/>
                  <ellipse cx="457" cy="280" rx="14" ry="11" fill="#5A9A78"/>
                  <ellipse cx="488" cy="283" rx="12" ry="9.5" fill="#4A8A68"/>
                  <ellipse cx="470" cy="273" rx="10" ry="8.5" fill="#6AB090"/>
                  {/* QR CARD */}
                  <rect x="430" y="158" width="66" height="66" rx="12" fill="rgba(255,248,232,0.94)" filter="url(#sf)"/>
                  <rect x="438" y="166" width="19" height="19" rx="2.5" fill="#1E1B18"/>
                  <rect x="441" y="169" width="13" height="13" rx="1.5" fill="rgba(255,248,232,0.94)"/>
                  <rect x="444" y="172" width="7" height="7" rx="1" fill="#1E1B18"/>
                  <rect x="465" y="166" width="19" height="19" rx="2.5" fill="#1E1B18"/>
                  <rect x="468" y="169" width="13" height="13" rx="1.5" fill="rgba(255,248,232,0.94)"/>
                  <rect x="471" y="172" width="7" height="7" rx="1" fill="#1E1B18"/>
                  <rect x="438" y="193" width="19" height="19" rx="2.5" fill="#1E1B18"/>
                  <rect x="441" y="196" width="13" height="13" rx="1.5" fill="rgba(255,248,232,0.94)"/>
                  <rect x="444" y="199" width="7" height="7" rx="1" fill="#1E1B18"/>
                  <rect x="465" y="193" width="6" height="6" rx="1" fill="#1E1B18"/>
                  <rect x="473" y="193" width="6" height="6" rx="1" fill="#1E1B18"/>
                  <rect x="481" y="193" width="6" height="6" rx="1" fill="#1E1B18"/>
                  <rect x="465" y="201" width="6" height="6" rx="1" fill="#1E1B18"/>
                  <rect x="481" y="201" width="6" height="6" rx="1" fill="#1E1B18"/>
                  <rect x="473" y="209" width="6" height="6" rx="1" fill="#1E1B18"/>
                  <text x="463" y="238" textAnchor="middle" fill="#C04A28" fontSize="8" fontWeight="700" fontFamily="Inter,sans-serif">SCAN ME</text>
                  {/* PIZZA (top right) */}
                  <g transform="translate(478,60) rotate(-18)">
                    <polygon points="0,0 42,15 21,52" fill="#F5A876" filter="url(#sf2)"/>
                    <polygon points="0,0 42,15 36,7" fill="#E07850"/>
                    <circle cx="21" cy="25" r="5.5" fill="#F4D070"/>
                    <circle cx="30" cy="36" r="4.5" fill="#F4D070"/>
                    <circle cx="13" cy="36" r="3.8" fill="#F4D070"/>
                    <circle cx="15" cy="27" r="3.2" fill="#C04A28"/>
                    <circle cx="27" cy="19" r="2.8" fill="#C04A28"/>
                    <circle cx="25" cy="39" r="2.8" fill="#C04A28"/>
                  </g>
                  {/* BURGER (top centre) */}
                  <g transform="translate(300,36)" filter="url(#sf2)">
                    <ellipse cx="0" cy="31" rx="23" ry="7.5" fill="#E8A060"/>
                    <rect x="-21" y="21" width="42" height="10" rx="5" fill="#7A4020"/>
                    <rect x="-23" y="16" width="46" height="7" rx="3.5" fill="#80C090"/>
                    <rect x="-21" y="10" width="42" height="8" rx="4" fill="#C04A28" opacity="0.8"/>
                    <ellipse cx="0" cy="9" rx="23" ry="9.5" fill="#F4C060"/>
                    <ellipse cx="-6" cy="5" rx="3.5" ry="1.6" fill="#D4A030" transform="rotate(-18,-6,5)"/>
                    <ellipse cx="6" cy="4" rx="3.5" ry="1.6" fill="#D4A030" transform="rotate(18,6,4)"/>
                    <ellipse cx="0" cy="3" rx="3.5" ry="1.6" fill="#D4A030"/>
                  </g>
                  {/* NOODLE BOWL (top left) */}
                  <g transform="translate(78,116)" filter="url(#sf2)">
                    <ellipse cx="0" cy="15" rx="29" ry="9.5" fill="rgba(120,70,30,0.1)"/>
                    <path d="M-29,0 C-29,0 -29,27 0,29 C29,27 29,0 29,0 C29,-13 15.5,-17 0,-17 C-15.5,-17 -29,-13 -29,0Z" fill="#F4A0B0"/>
                    <ellipse cx="0" cy="0" rx="29" ry="10.5" fill="#FFBCC8"/>
                    <path d="M-17,-3 Q-4,7 11,-2 Q21,-9 19,4" stroke="#F4D070" strokeWidth="3.2" fill="none" strokeLinecap="round"/>
                    <path d="M-11,3 Q2,11 17,3" stroke="#F4D070" strokeWidth="2.8" fill="none" strokeLinecap="round"/>
                    <circle cx="2" cy="-4" r="5" fill="#C04A28" opacity="0.8"/>
                    <circle cx="-9" cy="3" r="3.8" fill="#8FC4A8" opacity="0.9"/>
                  </g>
                  {/* Sparkle dots */}
                  <circle cx="100" cy="78" r="4.5" fill="#F4D070" opacity="0.72"/>
                  <circle cx="106" cy="71" r="2.8" fill="#F4D070" opacity="0.48"/>
                  <circle cx="538" cy="168" r="5.5" fill="#C4B5D4" opacity="0.68"/>
                  <circle cx="131" cy="308" r="3.8" fill="#F4A0B0" opacity="0.62"/>
                  <circle cx="520" cy="318" r="4.5" fill="#8FC4A8" opacity="0.58"/>
                  <g transform="translate(546,98)" fill="#F4D070" opacity="0.68"><polygon points="0,-7 1.8,-1.8 7,0 1.8,1.8 0,7 -1.8,1.8 -7,0 -1.8,-1.8"/></g>
                  <g transform="translate(108,398)" fill="#F4A0B0" opacity="0.62"><polygon points="0,-5.5 1.4,-1.4 5.5,0 1.4,1.4 0,5.5 -1.4,1.4 -5.5,0 -1.4,-1.4"/></g>
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* ══ HOW IT WORKS — split with Analytics scene ══ */}
        <section id="how" className="section" style={{background:'rgba(255,255,255,0.14)',backdropFilter:'blur(10px)',borderTop:'1px solid rgba(255,215,155,0.28)',borderBottom:'1px solid rgba(255,215,155,0.28)'}}>
          <div className="inner">
            <div className="split">
              {/* Text */}
              <div>
                <div style={{fontSize:12,fontWeight:700,color:'#C04A28',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:12}}>How it works</div>
                <h2 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:'clamp(28px,3.5vw,42px)',color:'#1E1B18',lineHeight:1.12,marginBottom:20}}>
                  From QR scan<br/>to AR in seconds
                </h2>
                <p style={{fontSize:16,color:'rgba(42,31,16,0.58)',lineHeight:1.75,marginBottom:32,maxWidth:400}}>
                  No app downloads. No complex setup. Customers simply scan the QR code on their table and instantly see every dish in stunning 3D.
                </p>
                <div style={{display:'flex',flexDirection:'column',gap:18}}>
                  {[
                    {n:'01',t:'You upload your dishes',d:'Add photos, 3D models, prices, and nutrition info through your admin dashboard.'},
                    {n:'02',t:'We generate your QR code',d:'A custom QR code links to your branded AR menu page instantly.'},
                    {n:'03',t:'Customers scan & explore',d:'They point their phone at the table — food appears in real space, life-size.'},
                  ].map(s=>(
                    <div key={s.n} style={{display:'flex',gap:16,alignItems:'flex-start'}}>
                      <div style={{width:36,height:36,borderRadius:12,background:'linear-gradient(135deg,#E05A3A,#F07050)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:'0 4px 14px rgba(224,90,58,0.3)'}}>
                        <span style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:12,color:'#fff'}}>{s.n}</span>
                      </div>
                      <div>
                        <div style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:15,color:'#1E1B18',marginBottom:4}}>{s.t}</div>
                        <div style={{fontSize:14,color:'rgba(42,31,16,0.55)',lineHeight:1.6}}>{s.d}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Analytics scene SVG */}
              <div style={{position:'relative'}}>
                <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 50% 50%,rgba(255,255,255,0.28),transparent 70%)',borderRadius:'50%',pointerEvents:'none'}}/>
                <svg viewBox="0 0 480 420" xmlns="http://www.w3.org/2000/svg" style={{width:'100%',height:'auto',filter:'drop-shadow(0 16px 36px rgba(120,70,30,0.18))'}}>
                  <defs>
                    <filter id="ds"><feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="rgba(120,70,30,0.13)"/></filter>
                    <filter id="ds2"><feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="rgba(120,70,30,0.1)"/></filter>
                    <radialGradient id="scr" cx="50%" cy="0%"><stop offset="0%" stopColor="#2A3A5A"/><stop offset="100%" stopColor="#1A2A3A"/></radialGradient>
                  </defs>

                  {/* Isometric platform */}
                  <polygon points="60,210 240,100 420,210 240,320" fill="#FFF5DC" filter="url(#ds)"/>
                  <polygon points="60,210 240,320 240,370 60,260" fill="#DEB870"/>
                  <polygon points="420,210 240,320 240,370 420,260" fill="#C8A050"/>
                  <polygon points="60,210 240,100 420,210 240,320" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2"/>

                  {/* Dashboard screen */}
                  <rect x="145" y="80" width="190" height="130" rx="14" fill="url(#scr)" filter="url(#ds)"/>
                  <rect x="145" y="80" width="190" height="18" rx="14" fill="#2A3A5A"/>
                  <rect x="145" y="92" width="190" height="6" rx="0" fill="#2A3A5A"/>
                  {/* dots */}
                  <circle cx="158" cy="89" r="3.5" fill="#FF5F57" opacity="0.8"/>
                  <circle cx="168" cy="89" r="3.5" fill="#FEBC2E" opacity="0.8"/>
                  <circle cx="178" cy="89" r="3.5" fill="#28C840" opacity="0.8"/>
                  {/* Screen content */}
                  {/* Bar chart */}
                  <rect x="162" y="155" width="14" height="38" rx="4" fill="#8FC4A8" opacity="0.9"/>
                  <rect x="180" y="143" width="14" height="50" rx="4" fill="#F4A0B0" opacity="0.9"/>
                  <rect x="198" y="130" width="14" height="63" rx="4" fill="#E05A3A" opacity="0.85"/>
                  <rect x="216" y="148" width="14" height="45" rx="4" fill="#F4D070" opacity="0.9"/>
                  <rect x="234" y="137" width="14" height="56" rx="4" fill="#C4B5D4" opacity="0.9"/>
                  <rect x="252" y="120" width="14" height="73" rx="4" fill="#E05A3A" opacity="0.92"/>
                  {/* Grid lines */}
                  <line x1="155" y1="193" x2="305" y2="193" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
                  <line x1="155" y1="175" x2="305" y2="175" stroke="rgba(255,255,255,0.08)" strokeWidth="1"/>
                  <line x1="155" y1="157" x2="305" y2="157" stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
                  {/* Stat cards on screen */}
                  <rect x="158" y="102" width="58" height="24" rx="6" fill="rgba(224,90,58,0.25)"/>
                  <text x="168" y="117" fill="#F4A876" fontSize="8" fontWeight="700" fontFamily="Inter,sans-serif">↑ 24% Views</text>
                  <rect x="222" y="102" width="58" height="24" rx="6" fill="rgba(143,196,168,0.25)"/>
                  <text x="232" y="117" fill="#8FC4A8" fontSize="8" fontWeight="700" fontFamily="Inter,sans-serif">↑ 12% AR</text>
                  <rect x="286" y="102" width="40" height="24" rx="6" fill="rgba(244,208,112,0.25)"/>
                  <text x="297" y="117" fill="#F4D070" fontSize="8" fontWeight="700" fontFamily="Inter,sans-serif">98% ↑</text>

                  {/* Floating stat card — left */}
                  <rect x="32" y="155" width="110" height="68" rx="14" fill="rgba(255,248,232,0.92)" filter="url(#ds2)"/>
                  <rect x="42" y="164" width="22" height="22" rx="8" fill="rgba(143,196,168,0.35)"/>
                  <text x="53" y="179" textAnchor="middle" fontSize="12">🥗</text>
                  <text x="72" y="174" fill="#1E1B18" fontSize="10" fontWeight="700" fontFamily="Poppins,sans-serif">AR Views</text>
                  <text x="72" y="187" fill="#E05A3A" fontSize="14" fontWeight="800" fontFamily="Poppins,sans-serif">12,450</text>
                  <text x="72" y="198" fill="rgba(42,31,16,0.45)" fontSize="8.5" fontFamily="Inter,sans-serif">this month</text>

                  {/* Floating stat card — right */}
                  <rect x="338" y="148" width="110" height="68" rx="14" fill="rgba(255,248,232,0.92)" filter="url(#ds2)"/>
                  <rect x="348" y="157" width="22" height="22" rx="8" fill="rgba(244,160,176,0.35)"/>
                  <text x="359" y="172" textAnchor="middle" fontSize="12">📊</text>
                  <text x="378" y="167" fill="#1E1B18" fontSize="10" fontWeight="700" fontFamily="Poppins,sans-serif">Scans</text>
                  <text x="378" y="180" fill="#E05A3A" fontSize="14" fontWeight="800" fontFamily="Poppins,sans-serif">3,291</text>
                  <text x="378" y="191" fill="rgba(42,31,16,0.45)" fontSize="8.5" fontFamily="Inter,sans-serif">this week</text>

                  {/* Floating QR */}
                  <rect x="300" y="258" width="70" height="70" rx="14" fill="rgba(255,248,232,0.9)" filter="url(#ds2)"/>
                  <rect x="308" y="266" width="20" height="20" rx="3" fill="#1E1B18"/>
                  <rect x="311" y="269" width="14" height="14" rx="2" fill="rgba(255,248,232,0.9)"/>
                  <rect x="314" y="272" width="8" height="8" rx="1.5" fill="#1E1B18"/>
                  <rect x="332" y="266" width="20" height="20" rx="3" fill="#1E1B18"/>
                  <rect x="335" y="269" width="14" height="14" rx="2" fill="rgba(255,248,232,0.9)"/>
                  <rect x="338" y="272" width="8" height="8" rx="1.5" fill="#1E1B18"/>
                  <rect x="308" y="290" width="20" height="20" rx="3" fill="#1E1B18"/>
                  <rect x="311" y="293" width="14" height="14" rx="2" fill="rgba(255,248,232,0.9)"/>
                  <rect x="314" y="296" width="8" height="8" rx="1.5" fill="#1E1B18"/>
                  <rect x="332" y="290" width="7" height="7" rx="1.5" fill="#1E1B18"/>
                  <rect x="341" y="290" width="7" height="7" rx="1.5" fill="#1E1B18"/>
                  <rect x="332" y="299" width="7" height="7" rx="1.5" fill="#1E1B18"/>
                  <rect x="341" y="306" width="7" height="7" rx="1.5" fill="#1E1B18"/>
                  <text x="335" y="344" textAnchor="middle" fill="#C04A28" fontSize="8" fontWeight="700" fontFamily="Inter,sans-serif">YOUR QR</text>

                  {/* Plants on platform */}
                  <path d="M96,282 L91,306 Q91,311 101,312 Q111,312 115,312 Q125,312 125,306 L120,282Z" fill="#F4A0B0" filter="url(#ds2)"/>
                  <rect x="89" y="278" width="38" height="7" rx="3.5" fill="#FFBCC8"/>
                  <ellipse cx="108" cy="278" rx="19" ry="5.5" fill="#8B6040"/>
                  <ellipse cx="108" cy="262" rx="17" ry="13" fill="#5A9A78"/>
                  <ellipse cx="96" cy="252" rx="11" ry="9" fill="#4A8A68"/>
                  <ellipse cx="120" cy="255" rx="10" ry="8" fill="#6AB090"/>

                  {/* Sparkle */}
                  <g transform="translate(442,90)" fill="#F4D070" opacity="0.65"><polygon points="0,-6 1.5,-1.5 6,0 1.5,1.5 0,6 -1.5,1.5 -6,0 -1.5,-1.5"/></g>
                  <g transform="translate(38,110)" fill="#F4A0B0" opacity="0.6"><polygon points="0,-5 1.2,-1.2 5,0 1.2,1.2 0,5 -1.2,1.2 -5,0 -1.2,-1.2"/></g>
                  <circle cx="450" cy="290" r="4" fill="#C4B5D4" opacity="0.6"/>
                  <circle cx="30" cy="260" r="3.5" fill="#8FC4A8" opacity="0.55"/>
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* ══ FEATURES — 3-col cards with mini SVG icons ══ */}
        <section id="features" className="section">
          <div className="inner">
            <div style={{textAlign:'center',marginBottom:52}}>
              <div style={{fontSize:12,fontWeight:700,color:'#C04A28',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:12}}>Features</div>
              <h2 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:'clamp(28px,3.5vw,42px)',color:'#1E1B18',marginBottom:14}}>Everything you need</h2>
              <p style={{fontSize:16,color:'rgba(42,31,16,0.55)',maxWidth:480,margin:'0 auto'}}>One platform to manage your AR menu, track analytics, and grow your restaurant.</p>
            </div>
            <div className="feat-grid">
              {[
                {title:'AR Menu Viewer',  desc:'Dishes appear life-size in 3D on your customers\' table. Powered by WebAR.',       bg:'rgba(90,138,176,0.12)',  scene:<ARScene/>},
                {title:'Live Analytics',  desc:'Track scans, AR views, popular dishes, and repeat visitors in real time.',          bg:'rgba(42,58,90,0.08)',    scene:<AnalyticsScene/>},
                {title:'Instant QR Code', desc:'A unique QR code for your restaurant is generated the moment you sign up.',          bg:'rgba(196,181,212,0.18)', scene:<QRScene/>},
                {title:'Your Subdomain',  desc:'Your restaurant gets its own URL — restaurantname.advertradical.com.',              bg:'rgba(244,208,112,0.15)', scene:<LinkScene/>},
                {title:'Offers & Promos', desc:'Push time-limited promotional banners to your live menu in one click.',             bg:'rgba(224,90,58,0.08)',   scene:<PromoScene/>},
                {title:'No App Needed',   desc:'100% WebAR. Android Chrome and iOS Safari. Customers just scan and go.',           bg:'rgba(143,196,168,0.12)', scene:<NoAppScene/>},
              ].map(f=>(
                <div key={f.title} className="cc" style={{padding:'24px 22px',display:'flex',flexDirection:'column',gap:16}}>
                  <div style={{width:'100%',height:100,borderRadius:14,background:f.bg,overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {f.scene}
                  </div>
                  <h3 style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:15,color:'#1E1B18'}}>{f.title}</h3>
                  <p style={{fontSize:13.5,color:'rgba(42,31,16,0.55)',lineHeight:1.65,marginTop:-4}}>{f.desc}</p>
                </div>
              ))}
            </div>{/* feat-grid */}
          </div>
        </section>

        {/* ══ PLANS — with decorative scene ══ */}
        <section id="plans" className="section" style={{background:'rgba(255,255,255,0.14)',backdropFilter:'blur(10px)',borderTop:'1px solid rgba(255,215,155,0.28)',borderBottom:'1px solid rgba(255,215,155,0.28)'}}>
          <div className="inner">
            <div style={{textAlign:'center',marginBottom:52}}>
              <div style={{fontSize:12,fontWeight:700,color:'#C04A28',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:12}}>Pricing</div>
              <h2 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:'clamp(28px,3.5vw,42px)',color:'#1E1B18',marginBottom:14}}>Simple, transparent pricing</h2>
              <p style={{fontSize:16,color:'rgba(42,31,16,0.55)'}}>6-month plans. No hidden fees.</p>
            </div>
            <div className="plan-grid">
              {plans.map(p=>(
                <div key={p.name} className={`pc${p.tag==='Popular'?' pop':''}`}>
                  {p.tag && <div style={{position:'absolute',top:-14,left:'50%',transform:'translateX(-50%)',padding:'5px 18px',background:'linear-gradient(135deg,#E05A3A,#F07050)',color:'#fff',fontSize:11,fontWeight:700,borderRadius:30,whiteSpace:'nowrap',boxShadow:'0 4px 14px rgba(224,90,58,0.32)'}}>✦ {p.tag}</div>}
                  {/* Mini illustration per plan */}
                  <div style={{width:'100%',height:88,borderRadius:14,marginBottom:20,background:p.tag==='Popular'?'rgba(224,90,58,0.08)':'rgba(255,215,155,0.18)',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',padding:'0 8px'}}>
                    <PlanIllustration name={p.name}/>
                  </div>
                  <div style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:17,color:'#1E1B18',marginBottom:6}}>{p.name}</div>
                  <div style={{display:'flex',alignItems:'baseline',gap:4,marginBottom:20}}>
                    <span style={{fontFamily:'Poppins,sans-serif',fontWeight:900,fontSize:32,color:'#1E1B18'}}>{p.price}</span>
                    <span style={{fontSize:13,color:'rgba(42,31,16,0.42)'}}>{p.per}</span>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:24}}>
                    {[`${p.items} AR menu items`,`${p.storage} storage`,'Analytics','QR code','Custom subdomain'].map(f=>(
                      <div key={f} style={{display:'flex',alignItems:'center',gap:9,fontSize:13.5,color:'rgba(42,31,16,0.68)'}}>
                        <span style={{width:17,height:17,borderRadius:5,background:'rgba(224,90,58,0.14)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#E05A3A',fontWeight:700,flexShrink:0}}>✓</span>
                        {f}
                      </div>
                    ))}
                  </div>
                  <button className={p.tag==='Popular'?'btn-coral':'btn-outline'} style={{width:'100%',padding:'13px',borderRadius:12,fontSize:14,fontFamily:'Poppins,sans-serif',fontWeight:700}}>Get Started</button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ CTA — split with celebration scene ══ */}
        <section className="section">
          <div className="inner">
            <div style={{background:'rgba(255,248,230,0.72)',backdropFilter:'blur(16px)',border:'1.5px solid rgba(255,215,155,0.5)',borderRadius:32,padding:'56px 48px',boxShadow:'0 12px 48px rgba(120,70,30,0.14),inset 0 1px 0 rgba(255,255,255,0.7)',overflow:'hidden',position:'relative'}}>
              <div className="split" style={{gap:40}}>
                <div>
                  <h2 style={{fontFamily:'Poppins,sans-serif',fontWeight:900,fontSize:'clamp(28px,3.5vw,46px)',color:'#1E1B18',lineHeight:1.1,marginBottom:16}}>
                    Ready to bring your menu to life?
                  </h2>
                  <p style={{fontSize:16,color:'rgba(42,31,16,0.58)',lineHeight:1.7,marginBottom:32,maxWidth:380}}>
                    Join hundreds of restaurants already using Advert Radical to delight their customers with AR dining.
                  </p>
                  <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                    <Link href="/admin/login">
                      <button className="btn-dark" style={{padding:'15px 32px',fontSize:15}}>Start Free Today</button>
                    </Link>
                    <a href="mailto:hello@advertradical.com">
                      <button className="btn-outline" style={{padding:'15px 24px',fontSize:15}}>Talk to us</button>
                    </a>
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <CelebrationScene/>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══ FOOTER ══ */}
        <footer style={{borderTop:'1px solid rgba(200,140,80,0.18)',padding:'28px 0',background:'rgba(255,240,210,0.25)',backdropFilter:'blur(8px)'}}>
          <div className="inner" style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16}}>
            <span style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:15,color:'#1E1B18'}}>
              Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F4A86A)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
            </span>
            <span style={{fontSize:13,color:'rgba(42,31,16,0.38)'}}>© {new Date().getFullYear()} Advert Radical. All rights reserved.</span>
            <div style={{display:'flex',gap:24}}>
              {['Privacy','Terms'].map(l=><a key={l} href="#" style={{fontSize:13,color:'rgba(42,31,16,0.4)'}}>{l}</a>)}
              <Link href="/admin/login" style={{fontSize:13,color:'rgba(42,31,16,0.4)'}}>Sign in</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

/* ── Feature card illustrations — clean, bold, simple ── */
function ARScene() {
  return (
    <svg viewBox="0 0 200 100" style={{width:'100%',height:'100%'}}>
      {/* Phone — lighter color so it's not a dark blob */}
      <rect x="74" y="8" width="52" height="84" rx="11" fill="#3A506A"/>
      <rect x="79" y="15" width="42" height="60" rx="7" fill="#5A8AB0"/>
      {/* Hologram food above phone */}
      <ellipse cx="100" cy="10" rx="20" ry="8" fill="rgba(255,210,120,0.9)"/>
      <rect x="82" y="2" width="36" height="9" rx="4.5" fill="rgba(100,160,80,0.8)"/>
      <ellipse cx="100" cy="2" rx="20" ry="8" fill="rgba(244,200,100,0.95)"/>
      {/* Scan ring */}
      <ellipse cx="100" cy="10" rx="24" ry="9" fill="none" stroke="rgba(100,210,255,0.6)" strokeWidth="1.5" strokeDasharray="4,3"/>
      {/* Screen content — AR badge */}
      <rect x="83" y="28" width="34" height="13" rx="4" fill="rgba(100,200,255,0.25)"/>
      <rect x="86" y="31" width="6" height="6" rx="2" fill="rgba(100,200,255,0.5)"/>
      <rect x="95" y="33" width="18" height="2.5" rx="1" fill="rgba(255,255,255,0.4)"/>
      <rect x="95" y="37" width="12" height="2" rx="1" fill="rgba(255,255,255,0.25)"/>
      {/* Screen lines */}
      <rect x="83" y="46" width="34" height="2.5" rx="1" fill="rgba(255,255,255,0.12)"/>
      <rect x="83" y="51" width="26" height="2.5" rx="1" fill="rgba(255,255,255,0.09)"/>
      <rect x="83" y="56" width="20" height="2.5" rx="1" fill="rgba(255,255,255,0.07)"/>
      {/* Home bar */}
      <rect x="91" y="69" width="18" height="2.5" rx="1.25" fill="rgba(255,255,255,0.2)"/>
      {/* Floating dots */}
      <circle cx="44" cy="38" r="10" fill="#F4A0B0" opacity="0.7"/>
      <circle cx="160" cy="45" r="8" fill="#8FC4A8" opacity="0.7"/>
      <circle cx="38" cy="62" r="5" fill="#C4B5D4" opacity="0.6"/>
      <circle cx="164" cy="28" r="5" fill="#F4D070" opacity="0.65"/>
    </svg>
  );
}

function AnalyticsScene() {
  return (
    <svg viewBox="0 0 200 100" style={{width:'100%',height:'100%'}}>
      {/* Chart background */}
      <rect x="22" y="10" width="156" height="74" rx="12" fill="#2A3A5A" opacity="0.88"/>
      {/* Top stat pills */}
      <rect x="30" y="17" width="42" height="14" rx="5" fill="rgba(224,90,58,0.35)"/>
      <rect x="76" y="17" width="38" height="14" rx="5" fill="rgba(143,196,168,0.3)"/>
      <rect x="118" y="17" width="50" height="14" rx="5" fill="rgba(196,181,212,0.25)"/>
      <rect x="32" y="21" width="10" height="5" rx="1.5" fill="#F07050" opacity="0.9"/>
      <rect x="46" y="21" width="22" height="5" rx="1.5" fill="rgba(255,255,255,0.18)"/>
      {/* Bar chart */}
      <rect x="36"  y="58" width="14" height="22" rx="5" fill="#8FC4A8"/>
      <rect x="56"  y="46" width="14" height="34" rx="5" fill="#F4A0B0"/>
      <rect x="76"  y="36" width="14" height="44" rx="5" fill="#E05A3A"/>
      <rect x="96"  y="50" width="14" height="30" rx="5" fill="#F4D070"/>
      <rect x="116" y="40" width="14" height="40" rx="5" fill="#C4B5D4"/>
      <rect x="136" y="28" width="14" height="52" rx="5" fill="#E05A3A" opacity="0.85"/>
      {/* Floor line */}
      <line x1="28" y1="80" x2="172" y2="80" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
      {/* Floating dots outside */}
      <circle cx="12" cy="55" r="5" fill="#F4D070" opacity="0.6"/>
      <circle cx="190" cy="40" r="6" fill="#F4A0B0" opacity="0.55"/>
    </svg>
  );
}

function QRScene() {
  return (
    <svg viewBox="0 0 200 100" style={{width:'100%',height:'100%'}}>
      {/* Card bg */}
      <rect x="60" y="5" width="80" height="86" rx="16" fill="rgba(255,248,232,0.95)"/>
      {/* Top-left block */}
      <rect x="71" y="16" width="24" height="24" rx="4" fill="#1E1B18"/>
      <rect x="74" y="19" width="18" height="18" rx="3" fill="rgba(255,248,232,0.95)"/>
      <rect x="77" y="22" width="12" height="12" rx="2" fill="#1E1B18"/>
      {/* Top-right block */}
      <rect x="105" y="16" width="24" height="24" rx="4" fill="#1E1B18"/>
      <rect x="108" y="19" width="18" height="18" rx="3" fill="rgba(255,248,232,0.95)"/>
      <rect x="111" y="22" width="12" height="12" rx="2" fill="#1E1B18"/>
      {/* Bottom-left block */}
      <rect x="71" y="50" width="24" height="24" rx="4" fill="#1E1B18"/>
      <rect x="74" y="53" width="18" height="18" rx="3" fill="rgba(255,248,232,0.95)"/>
      <rect x="77" y="56" width="12" height="12" rx="2" fill="#1E1B18"/>
      {/* Data dots */}
      <rect x="105" y="50" width="8" height="8" rx="2" fill="#1E1B18"/>
      <rect x="115" y="50" width="8" height="8" rx="2" fill="#1E1B18"/>
      <rect x="125" y="50" width="8" height="8" rx="2" fill="#1E1B18"/>
      <rect x="105" y="60" width="8" height="8" rx="2" fill="#1E1B18"/>
      <rect x="125" y="60" width="8" height="8" rx="2" fill="#1E1B18"/>
      <rect x="115" y="70" width="8" height="8" rx="2" fill="#1E1B18"/>
      {/* Label */}
      <rect x="74" y="80" width="52" height="8" rx="4" fill="rgba(224,90,58,0.2)"/>
      {/* Corner dots */}
      <circle cx="38" cy="40" r="9" fill="#E05A3A" opacity="0.3"/>
      <circle cx="166" cy="60" r="7" fill="#8FC4A8" opacity="0.35"/>
    </svg>
  );
}

function LinkScene() {
  return (
    <svg viewBox="0 0 200 100" style={{width:'100%',height:'100%'}}>
      {/* Browser bar */}
      <rect x="18" y="30" width="164" height="40" rx="20" fill="rgba(255,248,232,0.92)"/>
      {/* Highlight pill */}
      <rect x="25" y="38" width="66" height="24" rx="12" fill="rgba(224,90,58,0.15)"/>
      {/* Text labels — as blocks for clean look */}
      <rect x="30" y="47" width="10" height="6" rx="2" fill="rgba(200,74,40,0.55)"/>
      <rect x="44" y="47" width="40" height="6" rx="2" fill="rgba(200,74,40,0.4)"/>
      <rect x="95" y="47" width="78" height="6" rx="2" fill="rgba(42,31,16,0.2)"/>
      {/* Chain link icon */}
      <rect x="87" y="43" width="12" height="12" rx="6" fill="none" stroke="rgba(42,31,16,0.25)" strokeWidth="2"/>
      <rect x="101" y="43" width="12" height="12" rx="6" fill="none" stroke="rgba(42,31,16,0.25)" strokeWidth="2"/>
      <line x1="93" y1="49" x2="101" y2="49" stroke="rgba(42,31,16,0.2)" strokeWidth="2"/>
      {/* Floating spheres */}
      <circle cx="14" cy="55" r="9" fill="#C4B5D4" opacity="0.55"/>
      <circle cx="188" cy="38" r="7" fill="#F4D070" opacity="0.6"/>
      <circle cx="180" cy="72" r="5" fill="#8FC4A8" opacity="0.5"/>
      <circle cx="24" cy="20" r="5" fill="#F4A0B0" opacity="0.5"/>
    </svg>
  );
}

function PromoScene() {
  return (
    <svg viewBox="0 0 200 100" style={{width:'100%',height:'100%'}}>
      {/* Banner */}
      <rect x="18" y="22" width="164" height="56" rx="16" fill="rgba(224,90,58,0.15)"/>
      <rect x="28" y="32" width="144" height="36" rx="10" fill="rgba(224,90,58,0.2)"/>
      {/* Megaphone icon */}
      <rect x="42" y="40" width="14" height="20" rx="3" fill="#E05A3A" opacity="0.7"/>
      <polygon points="56,38 74,28 74,62 56,52" fill="#E05A3A" opacity="0.75"/>
      <rect x="74" y="40" width="6" height="20" rx="3" fill="#E05A3A" opacity="0.55"/>
      {/* Stars / sparkle */}
      <circle cx="98" cy="44" r="4" fill="#F4D070" opacity="0.85"/>
      <circle cx="110" cy="58" r="3" fill="#F4D070" opacity="0.7"/>
      {/* 20% OFF label blocks */}
      <rect x="120" y="38" width="40" height="10" rx="5" fill="#E05A3A" opacity="0.25)"/>
      <rect x="122" y="40" width="36" height="7" rx="3" fill="rgba(224,90,58,0.35)"/>
      <rect x="120" y="52" width="30" height="6" rx="3" fill="rgba(224,90,58,0.2)"/>
      {/* Corner circles */}
      <circle cx="14" cy="30" r="7" fill="#F4D070" opacity="0.55"/>
      <circle cx="188" cy="72" r="8" fill="#F4A0B0" opacity="0.5"/>
    </svg>
  );
}

function NoAppScene() {
  return (
    <svg viewBox="0 0 200 100" style={{width:'100%',height:'100%'}}>
      {/* Phone */}
      <rect x="106" y="6" width="48" height="82" rx="11" fill="#3A506A"/>
      <rect x="111" y="13" width="38" height="60" rx="7" fill="#5A8AB0"/>
      <rect x="119" y="69" width="22" height="3" rx="1.5" fill="rgba(255,255,255,0.2)"/>
      {/* Screen content */}
      <rect x="116" y="20" width="28" height="18" rx="5" fill="rgba(100,200,255,0.2)"/>
      <rect x="119" y="32" width="22" height="3" rx="1.5" fill="rgba(255,255,255,0.25)"/>
      <rect x="119" y="37" width="16" height="2.5" rx="1" fill="rgba(255,255,255,0.18)"/>
      <rect x="116" y="44" width="28" height="3" rx="1.5" fill="rgba(255,255,255,0.12)"/>
      <rect x="116" y="50" width="20" height="2.5" rx="1" fill="rgba(255,255,255,0.09)"/>
      {/* No download badge */}
      <rect x="28" y="28" width="64" height="44" rx="14" fill="rgba(255,248,232,0.92)"/>
      {/* Cross in circle */}
      <circle cx="60" cy="42" r="12" fill="rgba(224,90,58,0.15)" stroke="#E05A3A" strokeWidth="1.5"/>
      <line x1="55" y1="37" x2="65" y2="47" stroke="#E05A3A" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="65" y1="37" x2="55" y2="47" stroke="#E05A3A" strokeWidth="2.2" strokeLinecap="round"/>
      {/* "No App" label */}
      <rect x="34" y="58" width="52" height="7" rx="3" fill="rgba(100,60,30,0.15)"/>
      {/* Arrow */}
      <line x1="94" y1="50" x2="104" y2="50" stroke="rgba(224,90,58,0.5)" strokeWidth="2" strokeDasharray="3,2"/>
      <polygon points="104,46 110,50 104,54" fill="rgba(224,90,58,0.5)"/>
      {/* Dots */}
      <circle cx="18" cy="35" r="6" fill="#8FC4A8" opacity="0.55"/>
      <circle cx="186" cy="30" r="7" fill="#F4D070" opacity="0.6"/>
    </svg>
  );
}

function PlanIllustration({ name }) {
  if (name === 'Basic') return (
    <svg viewBox="0 0 260 80" style={{width:'100%',height:'100%'}}>
      {/* Single dish icon — plate with fork/knife */}
      <rect x="18" y="16" width="48" height="48" rx="14" fill="rgba(224,168,80,0.2)"/>
      {/* Plate */}
      <circle cx="42" cy="40" r="16" fill="rgba(255,230,170,0.9)"/>
      <circle cx="42" cy="40" r="10" fill="rgba(255,215,140,0.8)"/>
      <circle cx="42" cy="40" r="5" fill="#E8A050" opacity="0.7"/>
      {/* Fork left */}
      <rect x="22" y="30" width="3" height="20" rx="1.5" fill="rgba(160,100,40,0.45)"/>
      {/* Knife right */}
      <rect x="60" y="30" width="3" height="20" rx="1.5" fill="rgba(160,100,40,0.45)"/>
      {/* Divider */}
      <rect x="82" y="20" width="1.5" height="40" rx="0.75" fill="rgba(160,100,40,0.12)"/>
      {/* Text info */}
      <text x="98" y="36" fill="#6B4A20" fontSize="13" fontWeight="700" fontFamily="Poppins,sans-serif">10 AR items</text>
      <text x="98" y="54" fill="rgba(100,60,30,0.5)" fontSize="11" fontFamily="Inter,sans-serif">500MB storage</text>
    </svg>
  );
  if (name === 'Pro') return (
    <svg viewBox="0 0 260 80" style={{width:'100%',height:'100%'}}>
      {/* Two dish icons */}
      <rect x="12" y="16" width="44" height="48" rx="13" fill="rgba(224,90,58,0.12)"/>
      {/* Bowl 1 */}
      <ellipse cx="34" cy="45" rx="14" ry="5" fill="#E8906A" opacity="0.6"/>
      <path d="M20,32 C20,32 19,47 34,48 C49,47 48,32 48,32 C48,24 42,20 34,20 C26,20 20,24 20,32Z" fill="#F5AA7A"/>
      <ellipse cx="34" cy="31" rx="14" ry="5.5" fill="#FFCCA0"/>
      <ellipse cx="34" cy="28" rx="10" ry="4" fill="#F4D070" opacity="0.9"/>
      {/* Bowl 2 (offset) */}
      <rect x="60" y="18" width="40" height="44" rx="12" fill="rgba(224,90,58,0.09)"/>
      <ellipse cx="80" cy="46" rx="12" ry="4.5" fill="#8FC4A8" opacity="0.6"/>
      <path d="M68,34 C68,34 67,48 80,49 C93,48 92,34 92,34 C92,27 87,23 80,23 C73,23 68,27 68,34Z" fill="#AAD4BC"/>
      <ellipse cx="80" cy="33" rx="12" ry="5" fill="#C4E8D4"/>
      <ellipse cx="80" cy="30" rx="8" ry="3.5" fill="#6AB090" opacity="0.9"/>
      {/* Divider */}
      <rect x="114" y="18" width="1.5" height="44" rx="0.75" fill="rgba(160,100,40,0.12)"/>
      {/* Text */}
      <text x="128" y="36" fill="#8B3020" fontSize="13" fontWeight="700" fontFamily="Poppins,sans-serif">40 AR items</text>
      <text x="128" y="54" fill="rgba(100,60,30,0.5)" fontSize="11" fontFamily="Inter,sans-serif">2GB storage</text>
    </svg>
  );
  // Premium
  return (
    <svg viewBox="0 0 260 80" style={{width:'100%',height:'100%'}}>
      {/* Three dish icons */}
      <rect x="8" y="18" width="36" height="44" rx="11" fill="rgba(196,181,212,0.25)"/>
      <ellipse cx="26" cy="44" rx="11" ry="4" fill="#E8906A" opacity="0.55"/>
      <path d="M15,33 C15,33 14,46 26,47 C38,46 37,33 37,33 C37,26 32,22 26,22 C20,22 15,26 15,33Z" fill="#F5AA7A"/>
      <ellipse cx="26" cy="32" rx="11" ry="4.5" fill="#FFCCA0"/>
      <ellipse cx="26" cy="29" rx="7" ry="3" fill="#F4D070" opacity="0.9"/>

      <rect x="48" y="18" width="36" height="44" rx="11" fill="rgba(196,181,212,0.2)"/>
      <ellipse cx="66" cy="44" rx="11" ry="4" fill="#8FC4A8" opacity="0.55"/>
      <path d="M55,33 C55,33 54,46 66,47 C78,46 77,33 77,33 C77,26 72,22 66,22 C60,22 55,26 55,33Z" fill="#AAD4BC"/>
      <ellipse cx="66" cy="32" rx="11" ry="4.5" fill="#C4E8D4"/>
      <ellipse cx="66" cy="29" rx="7" ry="3" fill="#6AB090" opacity="0.9"/>

      <rect x="88" y="18" width="36" height="44" rx="11" fill="rgba(196,181,212,0.15)"/>
      <ellipse cx="106" cy="44" rx="11" ry="4" fill="#F4A0B0" opacity="0.55"/>
      <path d="M95,33 C95,33 94,46 106,47 C118,46 117,33 117,33 C117,26 112,22 106,22 C100,22 95,26 95,33Z" fill="#FFBCC8"/>
      <ellipse cx="106" cy="32" rx="11" ry="4.5" fill="#FFD0DC"/>
      <ellipse cx="106" cy="29" rx="7" ry="3" fill="#E8809C" opacity="0.9"/>

      {/* Divider */}
      <rect x="136" y="18" width="1.5" height="44" rx="0.75" fill="rgba(160,100,40,0.12)"/>
      {/* Text */}
      <text x="150" y="36" fill="#6A4A8A" fontSize="13" fontWeight="700" fontFamily="Poppins,sans-serif">100 AR items</text>
      <text x="150" y="54" fill="rgba(100,60,30,0.5)" fontSize="11" fontFamily="Inter,sans-serif">5GB storage</text>
    </svg>
  );
}

function CelebrationScene() {
  return (
    <svg viewBox="0 0 340 240" xmlns="http://www.w3.org/2000/svg" style={{width:320,height:220,filter:'drop-shadow(0 8px 24px rgba(120,70,30,0.14))'}}>
      <defs>
        <filter id="cs"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="rgba(120,70,30,0.12)"/></filter>
      </defs>
      {/* Isometric mini platform */}
      <polygon points="60,140 170,75 280,140 170,205" fill="#FFF5DC" filter="url(#cs)"/>
      <polygon points="60,140 170,205 170,230 60,165" fill="#DEB870"/>
      <polygon points="280,140 170,205 170,230 280,165" fill="#C8A050"/>
      {/* 3 dish bowls on platform */}
      <ellipse cx="130" cy="160" rx="30" ry="10" fill="rgba(160,90,30,0.1)"/>
      <path d="M100,138 C100,138 98,162 130,164 C162,162 160,138 160,138 C160,124 147,118 130,118 C113,118 100,124 100,138Z" fill="#8FC4A8"/>
      <ellipse cx="130" cy="136" rx="30" ry="11" fill="#AAD4BC"/>
      <ellipse cx="130" cy="130" rx="26" ry="9" fill="#6AB090"/>
      <circle cx="128" cy="126" r="5" fill="#E05A3A" opacity="0.75"/>

      <ellipse cx="170" cy="148" rx="26" ry="9" fill="rgba(160,90,30,0.1)"/>
      <path d="M144,128 C144,128 142,150 170,152 C198,150 196,128 196,128 C196,116 184,111 170,111 C156,111 144,116 144,128Z" fill="#E8906A"/>
      <ellipse cx="170" cy="126" rx="26" ry="10" fill="#F5AA7A"/>
      <ellipse cx="170" cy="121" rx="22" ry="8" fill="#F4D070"/>
      <ellipse cx="170" cy="117" rx="10" ry="4" fill="#6AB090"/>
      <path d="M160,110 Q158,100 161,91" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" fill="none"/>
      <path d="M170,107 Q168,97 171,89" stroke="rgba(255,255,255,0.38)" strokeWidth="1.7" strokeLinecap="round" fill="none"/>

      <ellipse cx="212" cy="158" rx="24" ry="8" fill="rgba(160,90,30,0.08)"/>
      <path d="M188,140 C188,140 186,160 212,162 C238,160 236,140 236,140 C236,129 225,124 212,124 C199,124 188,129 188,140Z" fill="#F4A0B0"/>
      <ellipse cx="212" cy="138" rx="24" ry="9" fill="#FFBCC8"/>
      <ellipse cx="212" cy="133" rx="20" ry="7.5" fill="#E8809C"/>

      {/* Phone */}
      <rect x="76" y="78" width="34" height="59" rx="7" fill="#1E1B18" filter="url(#cs)"/>
      <rect x="80" y="83" width="26" height="44" rx="5" fill="#1A2A4A"/>
      <text x="93" y="107" textAnchor="middle" fill="rgba(100,220,255,0.9)" fontSize="5.5" fontWeight="700">AR LIVE</text>
      <rect x="84" y="112" width="18" height="8" rx="3" fill="rgba(224,90,58,0.35)"/>
      <line x1="84" y1="122" x2="106" y2="122" stroke="rgba(100,200,255,0.2)" strokeWidth="1"/>
      <line x1="84" y1="127" x2="100" y2="127" stroke="rgba(100,200,255,0.15)" strokeWidth="1"/>

      {/* Confetti */}
      <rect x="40" y="60" width="8" height="8" rx="2" fill="#E05A3A" opacity="0.7" transform="rotate(25,44,64)"/>
      <rect x="268" y="55" width="7" height="7" rx="2" fill="#8FC4A8" opacity="0.72" transform="rotate(-20,271,58)"/>
      <rect x="290" y="90" width="6" height="6" rx="2" fill="#F4D070" opacity="0.75" transform="rotate(15,293,93)"/>
      <rect x="30" y="110" width="6" height="6" rx="2" fill="#C4B5D4" opacity="0.7" transform="rotate(40,33,113)"/>
      <rect x="305" y="130" width="7" height="7" rx="2" fill="#F4A0B0" opacity="0.68" transform="rotate(-30,308,133)"/>
      <circle cx="55" cy="85" r="4" fill="#F4D070" opacity="0.65"/>
      <circle cx="295" cy="72" r="3.5" fill="#F4A0B0" opacity="0.6"/>
      <g transform="translate(315,105)" fill="#F4D070" opacity="0.7"><polygon points="0,-6 1.5,-1.5 6,0 1.5,1.5 0,6 -1.5,1.5 -6,0 -1.5,-1.5"/></g>
      <g transform="translate(28,155)" fill="#8FC4A8" opacity="0.65"><polygon points="0,-5 1.2,-1.2 5,0 1.2,1.2 0,5 -1.2,1.2 -5,0 -1.2,-1.2"/></g>
      <circle cx="170" cy="42" r="5" fill="#E05A3A" opacity="0.45"/>
      <circle cx="310" cy="175" r="4" fill="#C4B5D4" opacity="0.5"/>
    </svg>
  );
}
