import React from 'react';
import { motion } from 'framer-motion';
import { Phone, Mail, MapPin, Facebook, Twitter, Instagram, Send, Bell, MessageSquare } from 'lucide-react';

export default function InvertedContactCard() {
  // This CSS mask creates the "bite" marks on the sides
  const maskStyle = {
    maskImage: `
      radial-gradient(circle at 0% 25%, transparent 30px, white 31px),
      radial-gradient(circle at 0% 50%, transparent 30px, white 31px),
      radial-gradient(circle at 0% 75%, transparent 30px, white 31px),
      radial-gradient(circle at 100% 15%, transparent 30px, white 31px),
      radial-gradient(circle at 100% 85%, transparent 30px, white 31px),
      linear-gradient(white, white)
    `,
    maskComposite: 'destination-in',
    WebkitMaskComposite: 'destination-in',
  };

  return (
    <div className="min-h-screen bg-[#6c6df4] flex items-center justify-center p-6 md:p-12 font-sans">
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={maskStyle}
        className="relative w-full max-w-6xl bg-white min-h-[650px] flex flex-col md:flex-row p-16 md:p-24 shadow-2xl overflow-hidden"
      >
        {/* LEFT SIDE: Form & Header */}
        <div className="flex-1 z-10">
          <h1 className="text-6xl font-black text-[#4c4df3] mb-6 tracking-tighter leading-none">
            Let's talk
          </h1>
          <p className="text-[#8c8df7] text-base font-semibold max-w-sm mb-12 opacity-90">
            To request a quote or want to meet up for coffee, contact us directly or fill out the form.
          </p>

          <div className="space-y-6 max-w-md">
            {['Your Name', 'Your Email'].map((label) => (
              <div key={label} className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-widest text-[#8c8df7] ml-2">{label}</label>
                <input type="text" className="w-full bg-[#f4f5ff] rounded-full h-14 px-8 focus:ring-4 ring-[#8c8df7]/10 outline-none border-none transition-all" />
              </div>
            ))}
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-[#8c8df7] ml-2">Your Message</label>
              <textarea rows="4" className="w-full bg-[#f4f5ff] rounded-[30px] p-8 focus:ring-4 ring-[#8c8df7]/10 outline-none border-none resize-none" />
            </div>
            <button className="bg-[#8b8cf7] text-white px-12 py-4 rounded-full font-black text-[11px] tracking-widest uppercase shadow-xl hover:bg-[#4c4df3] transition-all">
              Send Message
            </button>
          </div>
        </div>

        {/* RIGHT SIDE: Illustration & Info */}
        <div className="flex-1 flex flex-col justify-between items-center md:items-end text-right">
          
          {/* THE VECTOR COMBO */}
          <div className="relative w-full h-72 flex items-center justify-center">
            <div className="w-64 h-64 bg-[#f4f5ff] rounded-full flex items-center justify-center relative">
               <Mail size={100} className="text-[#8c8df7] opacity-10" />
               
               {/* Floating Stickers */}
               <motion.div animate={{ y: [-10, 10] }} transition={{ repeat: Infinity, duration: 3, repeatType: "mirror" }} className="absolute -top-4 -left-4 bg-white p-4 rounded-2xl shadow-lg">
                 <MessageSquare size={28} className="text-[#8c8df7]" />
               </motion.div>
               <motion.div animate={{ y: [10, -10] }} transition={{ repeat: Infinity, duration: 4, repeatType: "mirror" }} className="absolute top-10 -right-6 bg-white p-4 rounded-2xl shadow-lg">
                 <Bell size={28} className="text-[#8c8df7]" />
               </motion.div>
            </div>
          </div>

          {/* BOTTOM DETAILS */}
          <div className="w-full space-y-10">
            <div className="space-y-6">
              {[
                { text: "151 New Park Ave, Hartford, CT 06106", icon: <MapPin size={20} /> },
                { text: "+1 (203) 302-9545", icon: <Phone size={20} /> },
                { text: "contactus@inveritasoft.com", icon: <Mail size={20} /> }
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-end gap-4 text-[#8c8df7] text-sm font-bold">
                  <p>{item.text}</p>
                  <div className="w-10 h-10 bg-[#f4f5ff] rounded-full flex items-center justify-center text-[#4c4df3]">
                    {item.icon}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-4">
              <div className="w-10 h-10 bg-[#3b5998] text-white rounded-full flex items-center justify-center shadow-md"><Facebook size={18} fill="currentColor" /></div>
              <div className="w-10 h-10 bg-[#00acee] text-white rounded-full flex items-center justify-center shadow-md"><Twitter size={18} fill="currentColor" /></div>
              <div className="w-10 h-10 bg-[#d6249f] text-white rounded-full flex items-center justify-center shadow-md"><Instagram size={18} /></div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}