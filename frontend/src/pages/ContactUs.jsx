import React, { useState } from 'react';
import { contactAPI } from '../api/contact';
import { toast } from 'sonner';
import man from "../assets/man.png";

const LiquidMeltContactCard = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic client-side validation
    if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim()) {
      toast.error('Please fill in all required fields.');
      return;
    }

    if (!/^[0-9]{10}$/.test(formData.phone.trim())) {
      toast.error('Please enter a valid 10-digit phone number.');
      return;
    }

    try {
      setLoading(true);
      const res = await contactAPI.submit(formData);
      toast.success(res.data?.message || 'Enquiry sent successfully!');
      setFormData({ name: '', email: '', phone: '', message: '' });
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0]?.message ||
        'Something went wrong. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.body}>
      {/* 1. TEXTURE LAYER */}
      <div style={styles.noise} />

      {/* 2. THE LIQUID FILTER DEFINITIONS */}
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
        <div style={styles.meltLayer}>
          <div style={styles.mainRect} />
          <div style={{ ...styles.blob, top: '40px', left: '-30px', width: '70px', height: '60px' }} />
          <div style={{ ...styles.blob, top: '160px', left: '-45px', width: '90px', height: '50px' }} />
          <div style={{ ...styles.blob, top: '260px', left: '-35px', width: '80px', height: '70px' }} />
          <div style={{ ...styles.blob, top: '60px', right: '-40px', width: '100px', height: '60px' }} />
          <div style={{ ...styles.blob, top: '380px', right: '-35px', width: '90px', height: '80px' }} />
        </div>

        {/* 4. CONTENT LAYER */}
        <div style={styles.contentOverlay}>
          <div style={styles.innerLayout}>
            
            {/* LEFT COLUMN: The Form */}
            <div style={styles.leftCol}>
              <h1 style={styles.h1}>Get in <br/>touch</h1>
              <p style={styles.p}>Premium support for the modern curator. Drop us a line below.</p>
              
              <form onSubmit={handleSubmit} style={styles.formGroup}>
                <div style={styles.fieldRow}>
                  <div style={{...styles.field, flex: 1}}>
                    <label style={styles.label}>FULL NAME *</label>
                    <input
                      style={styles.input}
                      type="text"
                      name="name"
                      placeholder="John Doe"
                      value={formData.name}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div style={{...styles.field, flex: 1}}>
                    <label style={styles.label}>EMAIL *</label>
                    <input
                      style={styles.input}
                      type="email"
                      name="email"
                      placeholder="hello@company.com"
                      value={formData.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>PHONE NUMBER *</label>
                  <input
                    style={styles.input}
                    type="tel"
                    name="phone"
                    placeholder="9876543210"
                    value={formData.phone}
                    onChange={handleChange}
                    maxLength={10}
                    required
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>MESSAGE <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span></label>
                  <textarea
                    style={{...styles.input, height: '80px', resize: 'none'}}
                    name="message"
                    placeholder="How can we help?"
                    value={formData.message}
                    onChange={handleChange}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    ...styles.button,
                    opacity: loading ? 0.6 : 1,
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? 'SENDING...' : 'SEND ENQUIRY'}
                </button>
              </form>
            </div>

            {/* RIGHT COLUMN: Static Blended Image */}
            <div style={styles.rightCol}>
              <div style={styles.illustrationWrapper}>
                 <div style={styles.imageBackdrop} />
                 <img 
                    src={man}
                    alt="Contact" 
                    style={styles.mainImage} 
                 />
              </div>

              <div style={styles.contactDetails}>
                <div style={styles.infoGrid}>
                  <div style={styles.infoItem}>
                    <span style={styles.infoLabel}>LOCATION</span>
                    <span style={styles.infoValue}>Hartford, CT 06106</span>
                  </div>
                  <div style={styles.infoItem}>
                    <span style={styles.infoLabel}>PHONE</span>
                    <span style={styles.infoValue}>+1 (203) 302-9545</span>
                  </div>
                </div>
                
                <div style={styles.emailRow}>
                  <span style={styles.infoLabel}>DIRECT EMAIL</span>
                  <span style={{...styles.infoValue, color: '#8b7355'}}>hello@devdrop.studio</span>
                </div>

                <div style={styles.socialRow}>
                  {['INSTAGRAM', 'LINKEDIN', 'TWITTER'].map(name => (
                    <span key={name} style={styles.socialLink}>{name}</span>
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
    height: '680px',
    zIndex: 2,
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
    backgroundColor: '#e8e2d6',
    borderRadius: '40px'
  },
  blob: {
    position: 'absolute',
    backgroundColor: '#e8e2d6',
    borderRadius: '50%'
  },
  contentOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 100px'
  },
  innerLayout: {
    display: 'flex',
    width: '100%',
    gap: '80px',
  },
  leftCol: { 
    flex: 1.4,
    display: 'flex',
    flexDirection: 'column',
  },
  rightCol: { 
    flex: 1, 
    display: 'flex', 
    flexDirection: 'column', 
    justifyContent: 'space-between',
    padding: '30px 0'
  },
  h1: { color: '#1a1a1a', fontSize: '64px', margin: '0 0 10px 0', fontWeight: '900', lineHeight: '0.85', letterSpacing: '-3px', textTransform: 'uppercase' },
  p: { color: '#8b7355', fontSize: '15px', lineHeight: '1.5', marginBottom: '30px', maxWidth: '340px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '20px' },
  fieldRow: { display: 'flex', gap: '20px' },
  field: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '10px', color: '#1a1a1a', fontWeight: '800', letterSpacing: '1.5px' },
  input: {
    background: 'transparent',
    border: 'none',
    borderBottom: '1.5px solid rgba(139, 115, 85, 0.4)',
    padding: '10px 0',
    outline: 'none',
    fontSize: '15px',
    color: '#1a1a1a',
    fontFamily: '"Inter", sans-serif',
    transition: 'border-color 0.3s ease',
  },
  button: {
    background: '#1a1a1a',
    color: '#e8e2d6',
    border: 'none',
    padding: '20px 50px',
    borderRadius: '2px',
    fontWeight: '900',
    width: 'fit-content',
    cursor: 'pointer',
    marginTop: '5px',
    fontSize: '11px',
    letterSpacing: '2px',
    transition: 'all 0.3s ease',
  },
  illustrationWrapper: { 
    flex: 1, 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    position: 'relative' 
  },
  imageBackdrop: {
    position: 'absolute',
    width: '260px',
    height: '260px',
    backgroundColor: 'rgba(139, 115, 85, 0.1)',
    filter: 'blur(30px)',
    borderRadius: '50%',
    zIndex: 9
  },
  mainImage: { 
    width: '300px', 
    height: 'auto', 
    zIndex: 10, 
    filter: 'sepia(0.3) contrast(1.1) brightness(0.95)',
    mixBlendMode: 'multiply',
    pointerEvents: 'none'
  },
  contactDetails: { 
    display: 'flex', 
    flexDirection: 'column', 
    gap: '20px',
    borderTop: '1px solid rgba(139, 115, 85, 0.2)',
    paddingTop: '30px'
  },
  infoGrid: { display: 'flex', justifyContent: 'space-between' },
  infoItem: { display: 'flex', flexDirection: 'column', gap: '4px' },
  infoLabel: { fontSize: '9px', color: '#8b7355', fontWeight: '800', letterSpacing: '1px' },
  infoValue: { fontSize: '13px', color: '#1a1a1a', fontWeight: '700' },
  emailRow: { display: 'flex', flexDirection: 'column', gap: '4px' },
  socialRow: { display: 'flex', gap: '15px', marginTop: '5px' },
  socialLink: { fontSize: '9px', color: '#1a1a1a', fontWeight: '900', letterSpacing: '1px', cursor: 'pointer' }
};

export default LiquidMeltContactCard;