import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Loader from './components/Loading_Screen';
import LinkTransition from './components/TransitionLink';
import Home from './components/Home';
import About from './components/AboutUs';

export default function App() {
  return (
    <Router>
      <Loader />
      <nav className="fixed top-0 w-full p-8 flex justify-center gap-10 z-[50] text-white mix-blend-difference">
        {/* Use LinkTransition instead of Link */}
        <LinkTransition to="/" className="font-serif uppercase tracking-widest text-xs">Index</LinkTransition>
        <LinkTransition to="/about" className="font-serif uppercase tracking-widest text-xs">About</LinkTransition>
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </Router>
  );
}