import Head from 'next/head';
import Link from 'next/link';

const plans = [
  { name:'Basic',   price:'₹999',   per:'/6 months', items:10,  storage:'500MB', tag:null },
  { name:'Pro',     price:'₹2,499', per:'/6 months', items:40,  storage:'2GB',   tag:'Popular' },
  { name:'Premium', price:'₹4,999', per:'/6 months', items:100, storage:'5GB',   tag:'Best Value' },
];

const features = [
  { icon:'🥗', title:'AR Menu Viewing',    desc:'Customers scan your QR code and see menu items float in real 3D space — no app needed.' },
  { icon:'📊', title:'Analytics Dashboard',desc:'Track visits, item views, repeat customers, and AR interactions in real time.' },
  { icon:'🔗', title:'Your Own Subdomain', desc:'Every restaurant gets a dedicated URL — spot.advertradical.com — professional and shareable.' },
  { icon:'📱', title:'No App Required',    desc:'Powered by WebAR. Customers just scan — no downloads, no friction.' },
  { icon:'🔔', title:'Offers & Promotions',desc:'Push limited-time offers that appear as banners on your live menu page.' },
  { icon:'🔒', title:'Secure & Scalable',  desc:'Firebase-backed with plan enforcement, storage limits, and payment protection.' },
];

export default function HomePage() {
  return (
    <>
      <Head>
        <title>Advert Radical — AR Menus for Restaurants</title>
        <meta name="description" content="Give your restaurant an AR-powered menu. Customers scan, see food in 3D, and order with confidence." />
      </Head>

      <div style={{minHeight:'100vh',background:'#F5F4F0',fontFamily:'Inter,sans-serif',color:'#1C1917',overflowX:'hidden'}}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600&display=swap');
          *{box-sizing:border-box;margin:0;padding:0}
          a{text-decoration:none}
          .nav-link{color:#6B6460;font-size:14px;font-weight:500;transition:color 0.15s;}
          .nav-link:hover{color:#1C1917;}
          .hero-card{background:#fff;border-radius:20px;padding:20px;border:1px solid #E2DED8;box-shadow:0 4px 16px rgba(0,0,0,0.06);transition:all 0.2s;}
          .hero-card:hover{transform:translateY(-3px);box-shadow:0 8px 32px rgba(0,0,0,0.1);}
          .feat-card{background:#fff;border-radius:18px;padding:28px;border:1px solid #E2DED8;box-shadow:0 2px 8px rgba(0,0,0,0.04);transition:all 0.2s;}
          .feat-card:hover{border-color:rgba(255,107,53,0.3);box-shadow:0 6px 24px rgba(255,107,53,0.08);transform:translateY(-2px);}
          .plan-card{background:#fff;border-radius:20px;padding:28px;border:1.5px solid #E2DED8;box-shadow:0 2px 8px rgba(0,0,0,0.04);position:relative;transition:all 0.2s;}
          .plan-card.popular{border-color:#FF6B35;box-shadow:0 8px 32px rgba(255,107,53,0.15);}
          .plan-card:hover{transform:translateY(-3px);}
          .check{color:#FF6B35;font-weight:700;}
        `}</style>

        {/* NAV */}
        <nav style={{position:'fixed',top:0,left:0,right:0,zIndex:50,background:'rgba(245,244,240,0.9)',backdropFilter:'blur(20px)',borderBottom:'1px solid #E2DED8'}}>
          <div style={{maxWidth:1100,margin:'0 auto',padding:'0 28px',height:64,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:800,fontSize:18,color:'#1C1917'}}>
              Advert <span style={{background:'linear-gradient(135deg,#FF6B35,#FFB347)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
            </span>
            <div style={{display:'flex',alignItems:'center',gap:28}}>
              <a href="#features" className="nav-link">Features</a>
              <a href="#plans" className="nav-link">Plans</a>
              <Link href="/admin/login" className="nav-link">Restaurant Login</Link>
              <Link href="/superadmin/login" style={{padding:'8px 18px',background:'#1C1917',color:'#fff',borderRadius:10,fontSize:13,fontWeight:600,transition:'background 0.15s'}}>Admin</Link>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <section style={{paddingTop:130,paddingBottom:80,padding:'130px 28px 80px',textAlign:'center',position:'relative'}}>
          {/* Decorative circles */}
          <div style={{position:'absolute',top:60,right:'8%',width:320,height:320,borderRadius:'50%',background:'radial-gradient(circle,rgba(255,107,53,0.1),transparent 70%)',pointerEvents:'none'}} />
          <div style={{position:'absolute',bottom:'10%',left:'5%',width:240,height:240,borderRadius:'50%',background:'radial-gradient(circle,rgba(255,179,71,0.08),transparent 70%)',pointerEvents:'none'}} />

          <div style={{maxWidth:820,margin:'0 auto',position:'relative'}}>
            <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'6px 16px',borderRadius:30,background:'#fff',border:'1px solid #E2DED8',boxShadow:'0 2px 8px rgba(0,0,0,0.05)',fontSize:13,fontWeight:600,color:'#FF6B35',marginBottom:28}}>
              <span style={{width:7,height:7,borderRadius:'50%',background:'#FF6B35',animation:'blink 2s infinite'}} />
              WebAR Menu Platform for Restaurants
              <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
            </div>

            <h1 style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:800,fontSize:'clamp(38px,6vw,68px)',lineHeight:1.08,letterSpacing:'-0.02em',color:'#1C1917',marginBottom:22}}>
              Your menu,{' '}
              <span style={{background:'linear-gradient(135deg,#FF6B35,#FFB347)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>alive in 3D</span>
            </h1>

            <p style={{fontSize:'clamp(15px,2vw,18px)',color:'#6B6460',maxWidth:580,margin:'0 auto 36px',lineHeight:1.65}}>
              Give every dish a story. Customers scan your QR code, point their phone at the table,
              and watch food materialize in augmented reality — nutrients and ingredients on display.
            </p>

            <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              <Link href="/admin/login" style={{padding:'14px 28px',background:'linear-gradient(135deg,#FF6B35,#FFB347)',color:'#fff',borderRadius:13,fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:700,fontSize:15,boxShadow:'0 6px 20px rgba(255,107,53,0.35)',transition:'all 0.2s'}}>
                Get Your Restaurant Online →
              </Link>
              <a href="#features" style={{padding:'14px 28px',background:'#fff',color:'#1C1917',borderRadius:13,fontWeight:600,fontSize:15,border:'1.5px solid #E2DED8',boxShadow:'0 2px 8px rgba(0,0,0,0.05)',transition:'all 0.2s'}}>
                See How It Works
              </a>
            </div>
          </div>
        </section>

        {/* DEMO PREVIEW */}
        <section style={{padding:'0 28px 80px'}}>
          <div style={{maxWidth:900,margin:'0 auto',background:'#fff',borderRadius:24,border:'1px solid #E2DED8',boxShadow:'0 8px 40px rgba(0,0,0,0.08)',overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'14px 18px',borderBottom:'1px solid #F0EDE8',background:'#FAFAF8'}}>
              <div style={{display:'flex',gap:5}}>
                {['#FF5F57','#FEBC2E','#28C840'].map(c=><span key={c} style={{width:11,height:11,borderRadius:'50%',background:c,opacity:0.7}}/>)}
              </div>
              <div style={{flex:1,display:'flex',justifyContent:'center'}}>
                <div style={{padding:'4px 16px',background:'#F0EDE8',borderRadius:8,fontSize:12,color:'#6B6460',fontFamily:'monospace'}}>
                  spot.advertradical.com
                </div>
              </div>
            </div>
            <div style={{padding:'32px 28px'}}>
              <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:24}}>
                <div style={{width:48,height:48,borderRadius:14,background:'linear-gradient(135deg,rgba(255,107,53,0.15),rgba(255,179,71,0.1))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>🍜</div>
                <div>
                  <div style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:700,fontSize:18,color:'#1C1917'}}>Spot Restaurant</div>
                  <div style={{fontSize:13,color:'#A09890',marginTop:2}}>Bengaluru, Karnataka</div>
                </div>
                <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:20,background:'rgba(255,107,53,0.08)',border:'1px solid rgba(255,107,53,0.2)',fontSize:12,fontWeight:600,color:'#FF6B35'}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:'#FF6B35'}}/>AR Enabled
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
                {['Butter Chicken','Biryani','Paneer Tikka','Dal Makhani','Gulab Jamun','Lassi'].map((item,i) => (
                  <div key={item} className="hero-card" style={{textAlign:'center'}}>
                    <div style={{width:70,height:70,borderRadius:'50%',background:`linear-gradient(135deg,rgba(255,107,53,0.12),rgba(255,179,71,0.08))`,margin:'0 auto 10px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,boxShadow:'0 4px 12px rgba(0,0,0,0.08)'}}>
                      {['🍗','🍛','🧀','🥘','🍬','🥛'][i]}
                    </div>
                    <div style={{fontSize:12,fontWeight:600,color:'#1C1917',marginBottom:3}}>{item}</div>
                    <div style={{fontSize:11,color:'#FF6B35',fontWeight:600}}>View in AR →</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" style={{padding:'60px 28px 80px',background:'#fff',borderTop:'1px solid #E2DED8',borderBottom:'1px solid #E2DED8'}}>
          <div style={{maxWidth:1100,margin:'0 auto'}}>
            <div style={{textAlign:'center',marginBottom:52}}>
              <h2 style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:800,fontSize:'clamp(28px,4vw,44px)',color:'#1C1917',marginBottom:12}}>
                Everything your restaurant needs
              </h2>
              <p style={{fontSize:16,color:'#6B6460'}}>One platform. Full AR experience.</p>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:16}}>
              {features.map(f => (
                <div key={f.title} className="feat-card">
                  <div style={{fontSize:28,marginBottom:14}}>{f.icon}</div>
                  <h3 style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:700,fontSize:16,color:'#1C1917',marginBottom:8}}>{f.title}</h3>
                  <p style={{fontSize:13.5,color:'#6B6460',lineHeight:1.65}}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PLANS */}
        <section id="plans" style={{padding:'80px 28px'}}>
          <div style={{maxWidth:1000,margin:'0 auto'}}>
            <div style={{textAlign:'center',marginBottom:52}}>
              <h2 style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:800,fontSize:'clamp(28px,4vw,44px)',color:'#1C1917',marginBottom:12}}>Simple pricing</h2>
              <p style={{fontSize:16,color:'#6B6460'}}>6-month subscriptions. Cancel anytime.</p>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:16}}>
              {plans.map(p => (
                <div key={p.name} className={`plan-card${p.tag==='Popular'?' popular':''}`}>
                  {p.tag && (
                    <div style={{position:'absolute',top:-12,left:'50%',transform:'translateX(-50%)',padding:'4px 16px',background:'linear-gradient(135deg,#FF6B35,#FFB347)',color:'#fff',fontSize:11,fontWeight:700,borderRadius:20,whiteSpace:'nowrap',boxShadow:'0 4px 12px rgba(255,107,53,0.3)'}}>
                      {p.tag}
                    </div>
                  )}
                  <div style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:700,fontSize:18,color:'#1C1917',marginBottom:4}}>{p.name}</div>
                  <div style={{display:'flex',alignItems:'baseline',gap:4,marginBottom:20}}>
                    <span style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:800,fontSize:32,color:'#1C1917'}}>{p.price}</span>
                    <span style={{fontSize:13,color:'#A09890'}}>{p.per}</span>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:24}}>
                    {[`${p.items} AR menu items`,`${p.storage} storage`,'Analytics dashboard','QR code generator','Subdomain included'].map(f=>(
                      <div key={f} style={{display:'flex',alignItems:'center',gap:8,fontSize:13.5,color:'#1C1917'}}>
                        <span className="check">✓</span>{f}
                      </div>
                    ))}
                  </div>
                  <button style={{width:'100%',padding:'13px',borderRadius:12,border:p.tag==='Popular'?'none':'1.5px solid #E2DED8',background:p.tag==='Popular'?'linear-gradient(135deg,#FF6B35,#FFB347)':'#fff',color:p.tag==='Popular'?'#fff':'#1C1917',fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:700,fontSize:14,cursor:'pointer',boxShadow:p.tag==='Popular'?'0 4px 16px rgba(255,107,53,0.3)':'none',transition:'all 0.2s'}}>
                    Get Started
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{borderTop:'1px solid #E2DED8',padding:'28px',background:'#fff'}}>
          <div style={{maxWidth:1100,margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
            <span style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:800,fontSize:15,color:'#1C1917'}}>
              Advert <span style={{background:'linear-gradient(135deg,#FF6B35,#FFB347)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
            </span>
            <span style={{fontSize:13,color:'#A09890'}}>© {new Date().getFullYear()} Advert Radical. All rights reserved.</span>
            <div style={{display:'flex',gap:20}}>
              {['Privacy','Terms'].map(l=><a key={l} href="#" style={{fontSize:13,color:'#A09890'}}>{l}</a>)}
              <Link href="/admin/login" style={{fontSize:13,color:'#A09890'}}>Login</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
