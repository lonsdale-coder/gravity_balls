"use client";

import React, { useEffect, useRef, useState } from "react";
import Matter from "matter-js";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";

// Memoized Background Particles to reduce main thread load
const BackgroundParticles = React.memo(({ particles }: { particles: any[] }) => {
    return (
        <>
            {particles.map((p) => (
                <div
                    key={p.id}
                    className="absolute rounded-full bg-blue-200/20 pointer-events-none particle-float"
                    style={{
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        width: p.size,
                        height: p.size,
                        boxShadow: "0 0 10px rgba(255, 255, 255, 0.1)",
                        animationDuration: `${p.duration}s`,
                        animationDelay: `${p.delay}s`,
                    } as any}
                />
            ))}
        </>
    );
});
BackgroundParticles.displayName = "BackgroundParticles";

interface GlassShard {
    id: string;
    text: string;
    category: string;
    color: string;
    createdAt: number;
}

const CATEGORIES = [
    { name: "잡생각", color: "rgba(148, 163, 184, 0.4)" }, // Slate/Grey
    { name: "추억", color: "rgba(244, 114, 182, 0.4)" },   // Pink
    { name: "기분", color: "rgba(52, 211, 153, 0.4)" },   // Emerald/Green
    { name: "해야 할 일", color: "rgba(96, 165, 250, 0.4)" }, // Blue
];

const PASTEL_COLORS = [
    "rgba(173, 216, 230, 0.4)", // Light Blue
    "rgba(255, 182, 193, 0.4)", // Light Pink
    "rgba(221, 160, 221, 0.4)", // Plum
    "rgba(144, 238, 144, 0.4)", // Light Green
    "rgba(255, 239, 184, 0.4)", // Cream
    "rgba(240, 248, 255, 0.4)", // Alice Blue
];

export default function SeaGlassScene() {
    const sceneRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<Matter.Engine | null>(null);
    const [shards, setShards] = useState<GlassShard[]>([]);
    const [activeShard, setActiveShard] = useState<GlassShard | null>(null);
    const shardBodiesRef = useRef<Map<string, Matter.Body>>(new Map());
    const shardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const [userId, setUserId] = useState<string | null>(null);
    const [isAuthLoading, setIsAuthLoading] = useState(false);
    const [registrationMessage, setRegistrationMessage] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0]);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState("");
    const wallsRef = useRef<Matter.Body[]>([]);

    // Cosmic background particles (stars/bubbles)
    const [particles] = useState(() =>
        Array.from({ length: 50 }).map(() => ({
            id: Math.random(),
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: Math.random() * 2 + 1,
            duration: Math.random() * 10 + 20,
            delay: Math.random() * -20,
        }))
    );

    // Initialize Physics Engine
    useEffect(() => {
        if (!sceneRef.current) return;
        // ... (rest of the useEffect remains similar, just ensuring the walls adapt to resize if needed)
        const Engine = Matter.Engine,
            World = Matter.World,
            Bodies = Matter.Bodies,
            Mouse = Matter.Mouse,
            MouseConstraint = Matter.MouseConstraint;

        const engine = Engine.create();
        engine.world.gravity.y = 0;
        engineRef.current = engine;

        const width = window.innerWidth;
        const height = window.innerHeight;

        const createWalls = (w: number, h: number) => {
            if (wallsRef.current.length > 0) {
                World.remove(engine.world, wallsRef.current);
            }
            const newWalls = [
                Bodies.rectangle(w / 2, -10, w, 20, { isStatic: true, restitution: 1 }),
                Bodies.rectangle(w / 2, h + 10, w, 20, { isStatic: true, restitution: 1 }),
                Bodies.rectangle(-10, h / 2, 20, h, { isStatic: true, restitution: 1 }),
                Bodies.rectangle(w + 10, h / 2, 20, h, { isStatic: true, restitution: 1 }),
            ];
            wallsRef.current = newWalls;
            World.add(engine.world, newWalls);
        };

        createWalls(width, height);

        const handleResize = () => {
            if (!sceneRef.current) return;
            const newWidth = window.innerWidth;
            const newHeight = window.innerHeight;
            createWalls(newWidth, newHeight);
        };
        window.addEventListener('resize', handleResize);

        // Mouse interaction disabled to prevent manual movement
        // const mouse = Mouse.create(sceneRef.current);
        // const mouseConstraint = MouseConstraint.create(engine, {
        //     mouse: mouse,
        //     constraint: { stiffness: 0.1, render: { visible: false } },
        // });
        // World.add(engine.world, mouseConstraint);

        const runner = Matter.Runner.create();
        Matter.Runner.run(runner, engine);

        // Apply autonomous swimming forces with optimized calculation
        Matter.Events.on(engine, 'beforeUpdate', () => {
            const allBodies = Matter.Composite.allBodies(engine.world);
            const forceMagnitudeBase = 0.0001;

            for (let i = 0; i < allBodies.length; i++) {
                const body = allBodies[i];
                if (body.isStatic) continue;

                // Subtle random current
                Matter.Body.applyForce(body, body.position, {
                    x: (Math.random() - 0.5) * forceMagnitudeBase * body.mass,
                    y: (Math.random() - 0.5) * forceMagnitudeBase * body.mass
                });

                // Maintain minimum velocity
                const vx = body.velocity.x;
                const vy = body.velocity.y;
                const speedSq = vx * vx + vy * vy;
                if (speedSq < 0.25) { // 0.5 * 0.5
                    Matter.Body.setVelocity(body, {
                        x: vx * 1.05 + (Math.random() - 0.5) * 0.05,
                        y: vy * 1.05 + (Math.random() - 0.5) * 0.05
                    });
                }
            }
        });

        // Optimized render loop: direct DOM manipulation
        const update = () => {
            const bodiesMap = shardBodiesRef.current;
            const refsMap = shardRefs.current;

            refsMap.forEach((el, id) => {
                const body = bodiesMap.get(id);
                if (el && body) {
                    el.style.transform = `translate(${body.position.x}px, ${body.position.y}px) translate(-50%, -50%) rotate(${body.angle}rad)`;
                }
            });
            requestAnimationFrame(update);
        };
        const animId = requestAnimationFrame(update);

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animId);
            Matter.Runner.stop(runner);
            Engine.clear(engine);
        };
    }, []);

    // Add a shard
    const addShard = (text: string, categoryName: string) => {
        if (!engineRef.current) return;

        const id = Math.random().toString(36).substr(2, 9);
        const createdAt = Date.now();
        const categoryObj = CATEGORIES.find(c => c.name === categoryName) || CATEGORIES[0];
        const color = categoryObj.color;

        const x = Math.random() * (window.innerWidth - 100) + 50;
        const y = Math.random() * (window.innerHeight - 100) + 50;
        const radius = 40 + Math.random() * 20;

        const body = Matter.Bodies.circle(x, y, radius, {
            restitution: 0.95,
            frictionAir: 0.02,
        });

        Matter.Body.setVelocity(body, {
            x: (Math.random() - 0.5) * 1.5,
            y: (Math.random() - 0.5) * 1.5,
        });

        Matter.World.add(engineRef.current.world, body);
        shardBodiesRef.current.set(id, body);

        const newShard = {
            id,
            text,
            category: categoryName,
            color,
            createdAt
        };

        setShards((prev) => [...prev, newShard]);

        // Save to Supabase
        if (userId) {
            supabase.from('shards').insert({
                id: id,
                user_id: userId,
                text: text,
                category: categoryName,
                color: color,
                created_at: new Date(createdAt).toISOString()
            }).then(({ error }) => {
                if (error) console.error('Error saving shard:', error);
            });
        }
    };

    const deleteShard = (id: string) => {
        if (!engineRef.current) return;

        const body = shardBodiesRef.current.get(id);
        if (body) {
            Matter.World.remove(engineRef.current.world, body);
            shardBodiesRef.current.delete(id);
            shardRefs.current.delete(id);
        }

        setShards((prev) => prev.filter(s => s.id !== id));
        setActiveShard(null);

        // Delete from Supabase
        if (userId) {
            supabase.from('shards')
                .delete()
                .eq('id', id)
                .eq('user_id', userId)
                .then(({ error }) => {
                    if (error) console.error('Error deleting shard:', error);
                });
        }
    };

    const updateShard = (id: string, newText: string) => {
        setShards((prev) => prev.map(s => s.id === id ? { ...s, text: newText } : s));
        setIsEditing(false);
        setActiveShard(prev => prev ? { ...prev, text: newText } : null);

        // Update in Supabase
        if (userId) {
            supabase.from('shards')
                .update({ text: newText })
                .eq('id', id)
                .eq('user_id', userId)
                .then(({ error }) => {
                    if (error) console.error('Error updating shard:', error);
                });
        }
    };

    // Check for existing session on mount
    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                setUserId(session.user.id);
            }
            setIsAuthLoading(false);
        };
        checkSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session) {
                setUserId(session.user.id);
            } else {
                setUserId(null);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleAuth = React.useCallback(async (email: string, password: string, isSignUp: boolean) => {
        setIsAuthLoading(true);
        try {
            if (isSignUp) {
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;

                if (data.session) {
                    setUserId(data.user?.id || null);
                    setRegistrationMessage("가입을 축하합니다! 이메일 인증을 완료하시면 더욱 안전하게 이용하실 수 있습니다.");
                } else if (data.user) {
                    setRegistrationMessage("가입이 완료되었습니다! 안내 메일을 보내드렸으니 메일함에서 인증을 완료해 주세요.");
                }
            } else {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                setUserId(data.user?.id || null);
                setRegistrationMessage(null); // Clear message on login
            }
            return { success: true };
        } catch (error: any) {
            console.error('Auth error:', error.message);
            return { success: false, error: error.message };
        } finally {
            setIsAuthLoading(false);
        }
    }, []);

    const handleLogout = React.useCallback(async () => {
        await supabase.auth.signOut();
        setUserId(null);
        localStorage.removeItem('sea_glass_last_id');
    }, []);

    // Load last session
    useEffect(() => {
        const lastId = localStorage.getItem('sea_glass_last_id');
        if (lastId) setUserId(lastId);
    }, []);

    // Load user shards from Supabase
    useEffect(() => {
        if (userId && engineRef.current) {
            const loadData = async () => {
                // Clear existing shards from World
                shardBodiesRef.current.forEach(body => {
                    if (engineRef.current) Matter.World.remove(engineRef.current.world, body);
                });
                shardBodiesRef.current.clear();
                setShards([]);

                const { data, error } = await supabase
                    .from('shards')
                    .select('*')
                    .eq('user_id', userId);

                if (error) {
                    console.error('Error loading shards:', error);
                    return;
                }

                if (data) {
                    const loadedShards: GlassShard[] = data.map(item => ({
                        id: item.id,
                        text: item.text,
                        category: item.category,
                        color: item.color,
                        createdAt: new Date(item.created_at).getTime()
                    }));

                    loadedShards.forEach(s => {
                        const x = Math.random() * (window.innerWidth - 100) + 50;
                        const y = Math.random() * (window.innerHeight - 100) + 50;
                        const radius = 40 + Math.random() * 20;
                        const body = Matter.Bodies.circle(x, y, radius, {
                            restitution: 0.95,
                            frictionAir: 0.02,
                        });
                        Matter.Body.setVelocity(body, {
                            x: (Math.random() - 0.5) * 1.5,
                            y: (Math.random() - 0.5) * 1.5,
                        });
                        if (engineRef.current) Matter.World.add(engineRef.current.world, body);
                        shardBodiesRef.current.set(s.id, body);
                    });
                    setShards(loadedShards);
                }
            };

            loadData();
        }
    }, [userId]);

    // Mock initial data if no user
    useEffect(() => {
        if (!userId) {
            const timer = setTimeout(() => {
                // addShard("별 헤는 밤, 바다의 침묵");
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [userId]);

    return (
        <div ref={sceneRef} className="relative w-full h-screen overflow-hidden bg-transparent">
            {/* Cosmic Sea Background */}
            <div className="cosmic-sea-bg" />

            {/* Background Particles (Optimized) */}
            <BackgroundParticles particles={particles} />

            {/* Input UI */}
            <div className="absolute top-6 sm:top-10 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4 sm:px-6">
                <div className="flex flex-col gap-3 sm:gap-4">
                    {/* Category Selection - Scrollable on mobile */}
                    <div className="flex justify-start sm:justify-center gap-2 overflow-x-auto pb-2 no-scrollbar px-2">
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.name}
                                onClick={() => setSelectedCategory(cat)}
                                className={`whitespace-nowrap px-4 py-2 rounded-full text-[10px] sm:text-xs tracking-wider transition-all border shrink-0 ${selectedCategory.name === cat.name
                                    ? "bg-white/20 border-white/40 text-white shadow-lg"
                                    : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                                    }`}
                                style={selectedCategory.name === cat.name ? { boxShadow: `0 0 15px ${cat.color}` } : {}}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            const input = e.currentTarget.elements.namedItem("message") as HTMLInputElement;
                            if (input.value) {
                                addShard(input.value, selectedCategory.name);
                                input.value = "";
                            }
                        }}
                        className="flex gap-2 sm:gap-3"
                    >
                        <input
                            name="message"
                            type="text"
                            autoComplete="off"
                            placeholder={`${selectedCategory.name} 조각 띄우기...`}
                            className="flex-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-sm sm:text-base text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-light"
                        />
                        <button className="bg-blue-600/30 hover:bg-blue-600/50 backdrop-blur-xl text-blue-100 border border-blue-500/30 rounded-xl sm:rounded-2xl px-5 sm:px-8 py-3 sm:py-4 transition-all text-sm sm:text-base font-medium">
                            발송
                        </button>
                    </form>
                </div>
            </div>

            {/* Glass Shards */}
            {shards.map((shard) => {
                const body = shardBodiesRef.current.get(shard.id);
                if (!body) return null;

                const radius = (body as any).circleRadius;

                return (
                    <motion.div
                        key={shard.id}
                        ref={(el) => {
                            if (el) shardRefs.current.set(shard.id, el);
                            else shardRefs.current.delete(shard.id);
                        }}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={() => setActiveShard(shard)}
                        className="absolute cursor-pointer select-none group flex items-center justify-center overflow-hidden"
                        style={{
                            left: 0,
                            top: 0,
                            width: radius * 2,
                            height: radius * 2,
                            backgroundColor: shard.color.replace('0.4', '0.08'), // More transparent for perf
                            borderRadius: '50%',
                            border: "1.5px solid rgba(255, 255, 255, 0.15)",
                            boxShadow: "0 4px 15px rgba(0, 0, 0, 0.1)",
                            willChange: "transform", // Hint GPU
                            transition: "box-shadow 0.3s ease, scale 0.2s ease",
                        }}
                    >
                        {/* Shimmer Effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-black/10 opacity-30 rounded-full" />

                        {/* Shard Text Content */}
                        <div className="relative z-10 p-4 text-center pointer-events-none">
                            <p className="text-[11px] text-white/40 font-light leading-tight line-clamp-3 break-keep">
                                {shard.text}
                            </p>
                        </div>

                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white/5 rounded-full" />
                    </motion.div>
                );
            })}

            {/* Message Modal */}
            <AnimatePresence>
                {activeShard && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => {
                            setActiveShard(null);
                            setIsEditing(false);
                        }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-950/60 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 30, rotateX: 20 }}
                            animate={{ scale: 1, y: 0, rotateX: 0 }}
                            exit={{ scale: 0.9, y: 30, rotateX: 20 }}
                            className="glass-card max-w-lg w-full p-8 sm:p-12 rounded-[30px] sm:rounded-[40px] text-center relative overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Decorative glow inside modal */}
                            <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl text-xs" />
                            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl text-xs" />

                            {!isEditing ? (
                                <>
                                    <p className="text-xl sm:text-3xl font-light leading-relaxed text-blue-50 text-shadow-glow italic mb-4">
                                        "{activeShard.text}"
                                    </p>
                                    <div className="inline-block px-4 py-1 rounded-full border border-white/10 text-[10px] sm:text-xs tracking-tighter text-white/40 mb-6 sm:mb-10" style={{ backgroundColor: activeShard.color }}>
                                        {activeShard.category}
                                    </div>
                                    <div className="h-px w-24 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent mx-auto mb-6 sm:mb-10" />

                                    <div className="flex justify-center gap-6">
                                        <button
                                            onClick={() => {
                                                setEditText(activeShard.text);
                                                setIsEditing(true);
                                            }}
                                            className="text-blue-200/50 hover:text-blue-200 text-sm tracking-widest uppercase transition-all"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => deleteShard(activeShard.id)}
                                            className="text-red-400/50 hover:text-red-400 text-sm tracking-widest uppercase transition-all"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-6">
                                    <textarea
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 min-h-[120px] text-lg font-light"
                                    />
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setIsEditing(false)}
                                            className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 rounded-xl py-3 transition-all"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => updateShard(activeShard.id, editText)}
                                            className="flex-1 bg-blue-600/40 hover:bg-blue-600/60 text-white rounded-xl py-3 transition-all"
                                        >
                                            Save Changes
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="mt-8 text-blue-300/30 text-[10px] tracking-widest font-light">
                                이 기억은 당신의 바다에 머물러 있습니다.
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Auth Overlay */}
            <AnimatePresence>
                {!userId && !isAuthLoading && (
                    <AuthOverlay onAuth={handleAuth} />
                )}
            </AnimatePresence>

            {/* Logout button & Registration Message */}
            <div className="absolute top-6 sm:top-10 right-6 sm:right-10 z-50 flex flex-col items-end gap-4">
                {registrationMessage && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="bg-blue-500/10 backdrop-blur-md border border-blue-500/20 rounded-2xl px-6 py-3 text-blue-100/80 text-xs sm:text-sm font-light shadow-xl max-w-xs text-right relative group"
                    >
                        {registrationMessage}
                        <button
                            onClick={() => setRegistrationMessage(null)}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-blue-900/50 rounded-full flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            ✕
                        </button>
                    </motion.div>
                )}
                {userId && (
                    <button
                        onClick={handleLogout}
                        className="text-blue-400/40 hover:text-blue-400/80 text-[10px] sm:text-xs tracking-widest uppercase transition-all"
                    >
                        Logout
                    </button>
                )}
            </div>

            {/* Footer */}
            <div className="absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 sm:gap-2 pointer-events-none">
                <div className="text-blue-400/40 text-[8px] sm:text-[10px] tracking-[0.4em] uppercase font-light">
                    Deep Sea Space Orbit
                </div>
                <div className="w-8 sm:w-12 h-[1px] bg-blue-500/20" />
            </div>
        </div>
    );
}

// Sub-component for Email/Password Auth
const AuthOverlay = React.memo(({ onAuth }: { onAuth: (email: string, password: string, isSignUp: boolean) => Promise<{ success: boolean, error?: string }> }) => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSignUp, setIsSignUp] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !password.trim()) return;
        setLoading(true);
        setErrorMsg("");
        setSuccessMsg("");
        const result = await onAuth(email.trim(), password, isSignUp);
        if (result.success) {
            if (isSignUp) {
                setSuccessMsg("가입이 완료되었습니다! 이메일 인증을 완료해 주세요.");
            }
        } else if (result.error) {
            // Translate common Supabase Auth errors to Korean for better UX
            let translatedError = result.error;
            if (result.error.includes("rate limit")) translatedError = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
            else if (result.error.includes("Invalid login credentials")) translatedError = "이메일 또는 비밀번호가 올바르지 않습니다.";
            else if (result.error.includes("already registered")) translatedError = "이미 가입된 이메일입니다.";
            else if (result.error.includes("Password should be at least")) translatedError = "비밀번호는 최소 6자 이상이어야 합니다.";
            else if (result.error.includes("Email not confirmed")) translatedError = "이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요.";
            setErrorMsg(translatedError);
        }
        setLoading(false);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-3xl"
        >
            <motion.div
                initial={{ scale: 0.9, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                className="glass-card max-w-md w-full p-8 sm:p-12 rounded-[40px] text-center border border-white/10 shadow-2xl relative overflow-hidden"
            >
                {/* Decorative background glow */}
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10">
                    <h2 className="text-2xl sm:text-3xl font-light text-blue-100 mb-2 tracking-tight">
                        {isSignUp ? "기억의 시작" : "다시 만나요"}
                    </h2>
                    <p className="text-blue-400/60 text-xs sm:text-sm mb-10 font-light">
                        {isSignUp ? "당신의 소중한 조각들을 모을 준비를 하세요" : "당신의 우주 바다가 기다리고 있습니다"}
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1 text-left">
                            <label className="text-[10px] uppercase tracking-widest text-blue-300/40 ml-4">Email</label>
                            <input
                                type="email"
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={loading}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder-white/10 outline-none focus:ring-1 focus:ring-blue-500/50 transition-all font-light"
                                required
                            />
                        </div>

                        <div className="space-y-1 text-left">
                            <label className="text-[10px] uppercase tracking-widest text-blue-300/40 ml-4">Password</label>
                            <input
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder-white/10 outline-none focus:ring-1 focus:ring-blue-500/50 transition-all font-light"
                                required
                            />
                        </div>

                        {/* Success Message Display */}
                        <AnimatePresence>
                            {successMsg && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="text-emerald-400 text-xs sm:text-sm font-light mt-2 bg-emerald-500/10 py-3 px-4 rounded-xl border border-emerald-500/20"
                                >
                                    {successMsg}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Error Message Display */}
                        <AnimatePresence>
                            {errorMsg && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="text-red-400 text-xs sm:text-sm font-light mt-2 bg-red-500/10 py-2 px-4 rounded-xl border border-red-500/20"
                                >
                                    {errorMsg}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button
                            disabled={loading}
                            className="w-full mt-6 bg-gradient-to-r from-blue-600/40 to-indigo-600/40 hover:from-blue-600/60 hover:to-indigo-600/60 text-white rounded-2xl py-4 transition-all tracking-[0.2em] uppercase text-xs font-medium disabled:opacity-50 shadow-lg shadow-blue-900/20 border border-white/10"
                        >
                            {loading ? "작업 중..." : (isSignUp ? "가입하기" : "로그인")}
                        </button>
                    </form>

                    <div className="mt-8 flex flex-col gap-4">
                        <button
                            onClick={() => setIsSignUp(!isSignUp)}
                            className="text-blue-300/40 hover:text-blue-300/80 text-[11px] transition-all underline underline-offset-4 decoration-white/10 hover:decoration-blue-500/50"
                        >
                            {isSignUp ? "이미 계정이 있으신가요? 로그인" : "처음이신가요? 계정 만들기"}
                        </button>

                        <div className="w-12 h-[1px] bg-white/10 mx-auto" />

                        <p className="text-white/20 text-[10px] tracking-tight leading-relaxed px-4">
                            비밀번호를 분실하지 않도록 주의하세요.<br />
                            조각들은 당신의 계정에 안전하게 보관됩니다.
                        </p>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
});
AuthOverlay.displayName = "AuthOverlay";
