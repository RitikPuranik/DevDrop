import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';

const LinkTransition = ({ to, children, className }) => {
  const navigate = useNavigate();

  const handleTransition = (e) => {
    e.preventDefault();
    
    // Select the loader elements
    const loader = document.querySelector('.loader-container');
    const path = document.querySelector('.loader-path');

    const tl = gsap.timeline({
      onComplete: () => {
        navigate(to); // Change page ONLY after arch covers screen
        window.scrollTo(0, 0);
      }
    });

    // 1. Arc DOWN to cover the current page
    tl.set(loader, { display: "block" })
      .to(path, {
        attr: { d: "M0 0 L100 0 L100 0 Q50 100 0 0 L0 0" }, // Arching down
        duration: 0.6,
        ease: "power2.in",
      })
      .to(path, {
        attr: { d: "M0 0 L100 0 L100 100 Q50 100 0 100 L0 0" }, // Flatten to fill screen
        duration: 0.3,
        ease: "power2.out",
      });
  };

  return (
    <a href={to} onClick={handleTransition} className={className}>
      {children}
    </a>
  );
};

export default LinkTransition;