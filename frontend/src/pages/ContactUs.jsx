import React from 'react';

const LiquidMeltContactCard = () => {
  return (
    <div style={styles.body}>
      {/* 1. TEXTURE LAYER */}
      <div style={styles.noise} />

      {/* 2. THE LIQUID FILTER & SHADOW DEFINITIONS */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="metaballMelt" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="15" result="blur" />
            <feColorMatrix 
              in="blur" 
              mode="matrix" 
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 25 -10" 
              result="melt" 
            />
            <feComposite in="SourceGraphic" in2="melt" operator="atop" />
          </filter>
        </defs>
        
        <filter id="meltedShadow" x="-20%" y="-20%" width="150%" height="150%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="12" />
          <feOffset dx="0" dy="12" result="offsetblur" />
          <feComponentTransfer><feFuncA type="linear" slope="0.15" /></feComponentTransfer>
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </svg>

      {/* 3. THE CARD CONTAINER */}
      <div style={styles.cardContainer}>
        {/* SHAPE LAYER */}
        <div style={styles.meltLayer}>
          <div style={styles.mainRect} />
          {/* Left Side Blobs */}
          <div style={{ ...styles.blob, top: '40px', left: '-30px', width: '70px', height: '60px' }} />
          <div style={{ ...styles.blob, top: '160px', left: '-45px', width: '90px', height: '50px' }} />
          <div style={{ ...styles.blob, top: '260px', left: '-35px', width: '80px', height: '70px' }} />
          {/* Right Side Blobs */}
          <div style={{ ...styles.blob, top: '60px', right: '-40px', width: '100px', height: '60px' }} />
          <div style={{ ...styles.blob, top: '380px', right: '-35px', width: '90px', height: '80px' }} />
        </div>

        {/* 4. PERFECTLY ALIGNED CONTENT LAYER */}
        <div style={styles.contentOverlay}>
          <div style={styles.innerLayout}>
            {/* LEFT COLUMN */}
            <div style={styles.leftCol}>
              <h1 style={styles.h1}>Let's talk</h1>
              <p style={styles.p}>To request a quote or want to meet up for coffee... contact us directly or fill out the form.</p>
              
              <div style={styles.formGroup}>
                <div style={styles.field}>
                  <label style={styles.label}>Your Name</label>
                  <input style={styles.input} type="text" />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Your Email</label>
                  <input style={styles.input} type="email" />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Your Message</label>
                  <textarea style={{...styles.input, height: '90px', resize: 'none'}} />
                </div>
                <button style={styles.button}>Send Message</button>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div style={styles.rightCol}>
              <div style={styles.illustrationWrapper}>
                 <div style={styles.decorCircle} />
                 <span style={{fontSize: '70px', zIndex: 10}}>✉️</span>
              </div>
              <div style={styles.contactDetails}>
                <p style={styles.detailItem}>📍 151 New Park Ave, Hartford, CT 06106</p>
                <p style={styles.detailItem}>📞 +1 (203) 302-9545</p>
                <p style={styles.detailItem}>✉️ contactus@inveritasoft.com</p>
                <div style={styles.socialRow}>
                  {['f', 't', 'i'].map(icon => (
                    <div key={icon} style={styles.socialIcon}>{icon}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  body: {
    backgroundColor: '#000000',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"Inter", sans-serif',
    overflow: 'hidden',
    position: 'relative',
    color: '#000',
  },
  noise: {
    position: 'absolute',
    inset: 0,
    opacity: 0.05,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
    pointerEvents: 'none',
    zIndex: 1
  },
  cardContainer: {
    position: 'relative',
    width: '1100px',
    height: '650px',
    zIndex: 2
  },
  meltLayer: {
    position: 'absolute',
    inset: 0,
    filter: 'url(#metaballMelt) url(#meltedShadow)',
    zIndex: 1
  },
  mainRect: {
    position: 'absolute',
    inset: '20px 40px',
    backgroundColor: 'white',
    borderRadius: '40px'
  },
  blob: {
    position: 'absolute',
    backgroundColor: 'white',
    borderRadius: '50%'
  },
  contentOverlay: {
    position: 'absolute',
    inset: 0, // Spread across the entire container
    zIndex: 10,
    display: 'flex',
    alignItems: 'center', // Vertically center content
    justifyContent: 'center', // Horizontally center content
    padding: '0 80px' // Keep safe distance from "melted" edges
  },
  innerLayout: {
    display: 'flex',
    width: '100%',
    maxWidth: '900px', // Matches your original content width for consistency
    gap: '60px'
  },
  leftCol: { 
    flex: 1.2,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center' ,
  
  },
  rightCol: { 
    flex: 1, 
    display: 'flex', 
    flexDirection: 'column', 
    justifyContent: 'space-between',
    padding: '20px 0'
  },
  h1: { color: 'black', fontSize: '42px', margin: '0 0 10px 0', fontWeight: '800', lineHeight: '1.1' },
  p: { color: 'orange', fontSize: '15px', lineHeight: '1.6', marginBottom: '25px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '15px' },
  field: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontSize: '12px', color: '#bbb', fontWeight: '600' },
  input: {
    background: 'lightgray',
    border: 'none',
    padding: '12px 18px',
    borderRadius: '12px',
    outline: 'none',
    fontSize: '14px'
  },
  button: {
    background: 'orange',
    color: 'white',
    border: 'none',
    padding: '15px 40px',
    borderRadius: '50px',
    fontWeight: '700',
    width: 'fit-content',
    cursor: 'pointer',
    marginTop: '5px',
    boxShadow: '0 10px 20px rgba(129, 140, 248, 0.3)'
  },
  illustrationWrapper: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  decorCircle: { position: 'absolute', width: '200px', height: '200px', background: '#eff1ff', borderRadius: '50%' },
  contactDetails: { color: '#999', fontSize: '13px', lineHeight: '1.8' },
  detailItem: { margin: '4px 0' },
  socialRow: { display: 'flex', gap: '10px', marginTop: '15px' },
  socialIcon: { 
    width: '32px', height: '32px', background: 'orange', borderRadius: '50%', 
    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' 
  }
};

export default LiquidMeltContactCard;