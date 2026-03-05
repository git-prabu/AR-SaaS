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

        {/* HERO */}
        <section style={{paddingTop:130,paddingBottom:60,textAlign:'center',position:'relative',zIndex:1,animation:'fadeUp 0.9s ease forwards'}}>
          <div className="inner-sm">
            {/* Pill badge */}
            <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'7px 18px',borderRadius:30,background:'rgba(255,255,255,0.55)',border:'1.5px solid rgba(255,215,155,0.6)',backdropFilter:'blur(10px)',fontSize:13,fontWeight:600,color:'#8B4020',marginBottom:28,boxShadow:'0 4px 16px rgba(120,70,30,0.1)'}}>
              <span style={{width:7,height:7,borderRadius:'50%',background:'#E05A3A',animation:'blink 2s infinite'}}/>
              WebAR Menu Platform for Restaurants
            </div>

            <h1 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:'clamp(38px,6.5vw,72px)',lineHeight:1.07,letterSpacing:'-0.025em',color:'#1E1B18',marginBottom:22,textShadow:'0 2px 8px rgba(120,70,30,0.1)'}}>
              Your menu,{' '}
              <span style={{background:'linear-gradient(135deg,#E05A3A,#F07050)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>alive in 3D</span>
            </h1>

            <p style={{fontSize:'clamp(15px,2vw,19px)',color:'rgba(42,31,16,0.6)',maxWidth:550,margin:'0 auto 38px',lineHeight:1.7}}>
              Customers scan your QR code, point at the table, and watch food materialize in augmented reality — with full nutrition info on display.
            </p>

            <div style={{display:'flex',gap:14,justifyContent:'center',flexWrap:'wrap'}}>
              <Link href="/admin/login"><button className="btn-coral" style={{padding:'15px 32px',fontSize:15}}>Get Your Restaurant Online →</button></Link>
              <a href="#features"><button className="btn-ghost" style={{padding:'15px 32px',fontSize:15}}>See How It Works</button></a>
            </div>

            {/* Floating food icons */}
            <div style={{display:'flex',justifyContent:'center',gap:16,marginTop:44}}>
              {['🥗','🍜','🍕','🍱','🍣'].map((e,i)=>(
                <div key={e} style={{width:54,height:54,borderRadius:18,background:'rgba(255,245,225,0.7)',border:'1.5px solid rgba(255,215,155,0.5)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,boxShadow:'0 6px 20px rgba(120,70,30,0.12)',animation:`float ${4+i*0.6}s ease-in-out ${i*0.3}s infinite`}}>
                  {e}
                </div>
              ))}
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
