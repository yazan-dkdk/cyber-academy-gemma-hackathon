"use client";

import {
  useScroll,
  useSpring,
  useTransform,
  type TargetAndTransition,
  type Variants,
} from "framer-motion";

const premiumEase: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const viewportOnce = {
  once: true,
  amount: 0.22,
} as const;

export const revealContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.04,
    },
  },
};

export const revealItem: Variants = {
  hidden: {
    opacity: 0,
    y: 42,
    filter: "blur(10px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.72,
      ease: premiumEase,
    },
  },
};

export const revealSoft: Variants = {
  hidden: {
    opacity: 0,
    y: 28,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.62,
      ease: premiumEase,
    },
  },
};

export const cardMotion: { hover: TargetAndTransition } = {
  hover: {
    y: -10,
    scale: 1.025,
    transition: {
      duration: 0.28,
      ease: premiumEase,
    },
  },
};

export const buttonMotion: Variants = {
  rest: {
    scale: 1,
  },
  hover: {
    scale: 1.035,
    transition: {
      duration: 0.2,
      ease: premiumEase,
    },
  },
  tap: {
    scale: 0.97,
  },
};

export function useLandingParallax(distance = 80) {
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], [0, distance]);

  return useSpring(y, {
    stiffness: 80,
    damping: 24,
    mass: 0.3,
  });
}
