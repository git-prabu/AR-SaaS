import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';

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
        <meta name="description" content="Give your restaurant an AR-powered menu. Customers scan, see food in 3D, order with confidence."/>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
      </Head>

      <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#1a0f2e 0%,#0f1a2e 50%,#1a0820 100%)',fontFamily:'Inter,sans-serif',color:'#F0EEF8',overflowX:'hidden',position:'relative'}}>
        <style>{`
          *{box-sizing:border-box;margin:0;padding:0}
          a{text-decoration:none}

          /* Ambient background */
          .bg-grad{position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:0;
            background:
              radial-gradient(ellipse at 80% 10%, rgba(147,100,255,0.18) 0%, transparent 50%),
              radial-gradient(ellipse at 10% 60%, rgba(255,107,53,0.12) 0%, transparent 50%),
              radial-gradient(ellipse at 60% 90%, rgba(255,143,177,0.1) 0%, transparent 50%);
          }

          /* Floating clay balls */
          .clay{position:fixed;border-radius:50%;pointer-events:none;z-index:0;}

          /* Glass navbar */
          .nav{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:50;
            background:rgba(255,255,255,0.07);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
            border:1px solid rgba(255,255,255,0.13);border-radius:50px;
            padding:10px 24px;display:flex;align-items:center;gap:28px;
            box-shadow:0 8px 32px rgba(0,0,0,0.3);
            width:calc(100% - 40px);max-width:860px;
          }
          .nav-lnk{font-size:14px;color:rgba(255,255,255,0.55);font-weight:500;transition:color 0.15s;}
          .nav-lnk:hover{color:rgba(255,255,255,0.9);}

          /* Glass card */
          .gc{background:rgba(255,255,255,0.07);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.12);border-radius:24px;transition:all 0.25s;}
          .gc:hover{background:rgba(255,255,255,0.11);transform:translateY(-5px);box-shadow:0 20px 48px rgba(0,0,0,0.3);}

          /* Plan card */
          .pc{background:rgba(255,255,255,0.06);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1.5px solid rgba(255,255,255,0.1);border-radius:24px;padding:30px;position:relative;transition:all 0.25s;}
          .pc.pop{border-color:rgba(255,107,53,0.4);background:rgba(255,107,53,0.07);box-shadow:0 0 40px rgba(255,107,53,0.12);}
          .pc:hover{transform:translateY(-4px);}

          /* Gradient CTA btn */
          .btn-grad{background:linear-gradient(135deg,#FF6B35,#FFB347);color:#fff;border:none;border-radius:50px;font-family:Poppins,sans-serif;font-weight:700;cursor:pointer;transition:all 0.2s;box-shadow:0 8px 24px rgba(255,107,53,0.4);}
          .btn-grad:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(255,107,53,0.5);}

          .btn-ghost{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.8);border:1px solid rgba(255,255,255,0.15);border-radius:50px;font-weight:600;cursor:pointer;transition:all 0.2s;backdrop-filter:blur(8px);}
          .btn-ghost:hover{background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.25);}

          /* Animations */
          @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
          @keyframes floatR{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-10px) rotate(8deg)}}
          @keyframes pulse-glow{0%,100%{opacity:1}50%{opacity:0.4}}
          @keyframes fadeUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}

          .float{animation:float 5s ease-in-out infinite}
          .float2{animation:float 7s ease-in-out 1.5s infinite}
          .float3{animation:floatR 6s ease-in-out 0.8s infinite}

          .fade-up{animation:fadeUp 0.8s ease forwards}

          /* section */
          .section{position:relative;z-index:1;padding:80px 24px;}
          .inner{max-width:1100px;margin:0 auto;}
          .inner-sm{max-width:820px;margin:0 auto;}
        `}</style>

        <div className="bg-grad"/>

        {/* Floating clay decorations */}
        <div className="clay float"  style={{top:'8%', right:'6%',  width:90,  height:90,  background:'linear-gradient(135deg,rgba(255,107,53,0.45),rgba(255,179,71,0.35))', boxShadow:'0 20px 40px rgba(255,107,53,0.2)'}}/>
        <div className="clay float2" style={{top:'20%',left:'4%',   width:60,  height:60,  background:'linear-gradient(135deg,rgba(147,100,255,0.4),rgba(255,143,177,0.3))', boxShadow:'0 12px 24px rgba(147,100,255,0.15)'}}/>
        <div className="clay float3" style={{top:'55%',right:'3%',  width:50,  height:50,  borderRadius:14, background:'linear-gradient(135deg,rgba(255,143,177,0.4),rgba(147,100,255,0.3))'}}/>
        <div className="clay float"  style={{bottom:'25%',left:'6%',width:70,  height:70,  background:'linear-gradient(135deg,rgba(255,179,71,0.35),rgba(255,107,53,0.25))', animationDelay:'2s'}}/>
        <div className="clay float2" style={{top:'38%', right:'8%', width:35,  height:35,  borderRadius:10, background:'linear-gradient(135deg,rgba(34,197,94,0.3),rgba(16,185,129,0.2))'}}/>

        {/* NAV */}
        <nav className="nav">
          <span style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:17,color:'#F0EEF8',flexShrink:0}}>
            Advert <span style={{background:'linear-gradient(135deg,#FF6B35,#FFB347,#FF8FB1)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
          </span>
          <div style={{flex:1}}/>
          <div style={{display:'flex',alignItems:'center',gap:24}}>
            <a href="#features" className="nav-lnk">Features</a>
            <a href="#plans" className="nav-lnk">Plans</a>
            <Link href="/admin/login" className="nav-lnk">Login</Link>
            <Link href="/superadmin/login" style={{padding:'8px 20px',background:'rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.8)',border:'1px solid rgba(255,255,255,0.18)',borderRadius:30,fontSize:13,fontWeight:600,transition:'all 0.2s'}}>Admin</Link>
          </div>
        </nav>

        {/* HERO */}
        <section style={{paddingTop:140,paddingBottom:60,textAlign:'center',position:'relative',zIndex:1}}>
          <div className="inner-sm" style={{animation:'fadeUp 0.9s ease forwards'}}>
            {/* Pill badge */}
            <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'7px 18px',borderRadius:30,background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.13)',backdropFilter:'blur(12px)',fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.7)',marginBottom:30}}>
              <span style={{width:7,height:7,borderRadius:'50%',background:'#FF6B35',animation:'pulse-glow 2s infinite'}}/>
              WebAR Menu Platform for Restaurants
            </div>

            <h1 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:'clamp(40px,6.5vw,72px)',lineHeight:1.07,letterSpacing:'-0.025em',color:'#F0EEF8',marginBottom:24}}>
              Your menu,{' '}
              <span style={{background:'linear-gradient(135deg,#FF6B35 0%,#FFB347 50%,#FF8FB1 100%)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>alive in 3D</span>
            </h1>

            <p style={{fontSize:'clamp(15px,2vw,19px)',color:'rgba(255,255,255,0.55)',maxWidth:560,margin:'0 auto 40px',lineHeight:1.7}}>
              Customers scan your QR code, point at the table, and watch food materialize in augmented reality — with full nutrition info and ingredients.
            </p>

            <div style={{display:'flex',gap:14,justifyContent:'center',flexWrap:'wrap'}}>
              <Link href="/admin/login">
                <button className="btn-grad" style={{padding:'15px 32px',fontSize:15}}>Get Your Restaurant Online →</button>
              </Link>
              <a href="#features">
                <button className="btn-ghost" style={{padding:'15px 32px',fontSize:15}}>See How It Works</button>
              </a>
            </div>

            {/* Floating food icons below CTA */}
            <div style={{display:'flex',justifyContent:'center',gap:20,marginTop:48}}>
              {['🥗','🍜','🍕','🍱','🍣'].map((e,i)=>(
                <div key={e} style={{width:52,height:52,borderRadius:16,background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.12)',backdropFilter:'blur(10px)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,animation:`float ${4+i*0.6}s ease-in-out ${i*0.3}s infinite`}}>
                  {e}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* BROWSER MOCKUP / DEMO */}
        <section className="section" style={{paddingTop:20}}>
          <div className="inner-sm">
            <div style={{background:'rgba(255,255,255,0.05)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:28,overflow:'hidden',boxShadow:'0 32px 80px rgba(0,0,0,0.5)'}}>
              {/* Browser bar */}
              <div style={{display:'flex',alignItems:'center',gap:10,padding:'13px 18px',borderBottom:'1px solid rgba(255,255,255,0.07)',background:'rgba(255,255,255,0.03)'}}>
                <div style={{display:'flex',gap:5}}>
                  {['rgba(255,95,87,0.6)','rgba(254,188,46,0.6)','rgba(40,200,64,0.6)'].map(c=><span key={c} style={{width:10,height:10,borderRadius:'50%',background:c}}/>)}
                </div>
                <div style={{flex:1,display:'flex',justifyContent:'center'}}>
                  <div style={{padding:'5px 18px',background:'rgba(255,255,255,0.06)',borderRadius:8,fontSize:12,color:'rgba(255,255,255,0.4)',fontFamily:'monospace',border:'1px solid rgba(255,255,255,0.08)'}}>
                    spot.advertradical.com
                  </div>
                </div>
              </div>
              {/* Mock menu */}
              <div style={{padding:'28px 24px'}}>
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:22}}>
                  <div style={{width:44,height:44,borderRadius:14,background:'linear-gradient(135deg,rgba(255,107,53,0.25),rgba(255,179,71,0.15))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,border:'1px solid rgba(255,107,53,0.2)'}}>🍜</div>
                  <div>
                    <div style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:16,color:'#F0EEF8'}}>Spot Restaurant</div>
                    <div style={{fontSize:12,color:'rgba(255,255,255,0.35)',marginTop:2}}>Bengaluru, Karnataka</div>
                  </div>
                  <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:20,background:'rgba(255,107,53,0.12)',border:'1px solid rgba(255,107,53,0.25)',fontSize:11,fontWeight:700,color:'#FF8C5A'}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:'#FF6B35'}}/>AR Enabled
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
                  {[['🍗','Butter Chicken','₹320'],['🍛','Biryani','₹280'],['🧀','Paneer Tikka','₹250'],['🥘','Dal Makhani','₹180'],['🍬','Gulab Jamun','₹90'],['🥛','Lassi','₹80']].map(([em,name,price])=>(
                    <div key={name} style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:18,padding:'14px 12px',textAlign:'center',backdropFilter:'blur(10px)',transition:'all 0.2s'}}>
                      <div style={{width:56,height:56,borderRadius:'50%',background:'rgba(255,255,255,0.08)',margin:'0 auto 10px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,border:'2px solid rgba(255,255,255,0.08)',boxShadow:'0 4px 16px rgba(0,0,0,0.2)'}}>{em}</div>
                      <div style={{fontSize:12,fontWeight:600,color:'rgba(255,255,255,0.85)',marginBottom:3}}>{name}</div>
                      <div style={{fontSize:11,color:'#FF8C5A',fontWeight:700}}>{price}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="section">
          <div className="inner">
            <div style={{textAlign:'center',marginBottom:52}}>
              <h2 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:'clamp(28px,4vw,46px)',color:'#F0EEF8',marginBottom:14}}>
                Everything your restaurant needs
              </h2>
              <p style={{fontSize:16,color:'rgba(255,255,255,0.45)'}}>One platform. Full AR experience.</p>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(290px,1fr))',gap:14}}>
              {features.map(f=>(
                <div key={f.title} className="gc" style={{padding:28}}>
                  <div style={{fontSize:30,marginBottom:14}}>{f.icon}</div>
                  <h3 style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:16,color:'rgba(255,255,255,0.9)',marginBottom:8}}>{f.title}</h3>
                  <p style={{fontSize:13.5,color:'rgba(255,255,255,0.45)',lineHeight:1.7}}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PLANS */}
        <section id="plans" className="section" style={{paddingTop:40}}>
          <div className="inner">
            <div style={{textAlign:'center',marginBottom:52}}>
              <h2 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:'clamp(28px,4vw,46px)',color:'#F0EEF8',marginBottom:14}}>Simple pricing</h2>
              <p style={{fontSize:16,color:'rgba(255,255,255,0.45)'}}>6-month subscriptions. Cancel anytime.</p>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(270px,1fr))',gap:16,maxWidth:900,margin:'0 auto'}}>
              {plans.map(p=>(
                <div key={p.name} className={`pc${p.tag==='Popular'?' pop':''}`}>
                  {p.tag && (
                    <div style={{position:'absolute',top:-14,left:'50%',transform:'translateX(-50%)',padding:'5px 18px',background:'linear-gradient(135deg,#FF6B35,#FFB347)',color:'#fff',fontSize:11,fontWeight:700,borderRadius:30,whiteSpace:'nowrap',boxShadow:'0 4px 16px rgba(255,107,53,0.4)'}}>
                      ✦ {p.tag}
                    </div>
                  )}
                  <div style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:18,color:'rgba(255,255,255,0.9)',marginBottom:6}}>{p.name}</div>
                  <div style={{display:'flex',alignItems:'baseline',gap:4,marginBottom:22}}>
                    <span style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:34,color:'#F0EEF8'}}>{p.price}</span>
                    <span style={{fontSize:13,color:'rgba(255,255,255,0.35)'}}>{p.per}</span>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:11,marginBottom:26}}>
                    {[`${p.items} AR menu items`,`${p.storage} storage`,'Analytics dashboard','QR code generator','Subdomain included'].map(f=>(
                      <div key={f} style={{display:'flex',alignItems:'center',gap:9,fontSize:13.5,color:'rgba(255,255,255,0.65)'}}>
                        <span style={{width:16,height:16,borderRadius:5,background:'rgba(255,107,53,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#FF8C5A',fontWeight:700,flexShrink:0}}>✓</span>
                        {f}
                      </div>
                    ))}
                  </div>
                  <button className={p.tag==='Popular'?'btn-grad':'btn-ghost'} style={{width:'100%',padding:'13px',borderRadius:14,fontSize:14,fontFamily:'Poppins,sans-serif',fontWeight:700}}>
                    Get Started
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{borderTop:'1px solid rgba(255,255,255,0.07)',padding:'28px 24px',position:'relative',zIndex:1,background:'rgba(0,0,0,0.15)',backdropFilter:'blur(10px)'}}>
          <div className="inner" style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
            <span style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:15,color:'#F0EEF8'}}>
              Advert <span style={{background:'linear-gradient(135deg,#FF6B35,#FFB347)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
            </span>
            <span style={{fontSize:13,color:'rgba(255,255,255,0.25)'}}>© {new Date().getFullYear()} Advert Radical. All rights reserved.</span>
            <div style={{display:'flex',gap:20}}>
              {['Privacy','Terms'].map(l=><a key={l} href="#" style={{fontSize:13,color:'rgba(255,255,255,0.25)'}}>{l}</a>)}
              <Link href="/admin/login" style={{fontSize:13,color:'rgba(255,255,255,0.25)'}}>Login</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
