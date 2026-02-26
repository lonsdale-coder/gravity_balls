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

const INITIAL_CATEGORIES = [
    { name: "잡생각", color: "#94a3b8", glow: "#475569" }, // Slate
    { name: "추억", color: "#f472b6", glow: "#db2777" },   // Pink
    { name: "기분", color: "#34d399", glow: "#059669" },   // Emerald
    { name: "해야 할 일", color: "#60a5fa", glow: "#2563eb" }, // Blue
];

const NEW_CAT_COLORS = [
    { color: "#a78bfa", glow: "#7c3aed" }, // Violet
    { color: "#fb923c", glow: "#ea580c" }, // Orange
    { color: "#2dd4bf", glow: "#0d9488" }, // Teal
    { color: "#f87171", glow: "#dc2626" }, // Red
    { color: "#fbbf24", glow: "#d97706" }, // Amber
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
    const [categories, setCategories] = useState(INITIAL_CATEGORIES);
    const [selectedCategory, setSelectedCategory] = useState(INITIAL_CATEGORIES[0]);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [ripples, setRipples] = useState<{ id: number, x: number, y: number }[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState("");
    const wallsRef = useRef<Matter.Body[]>([]);

    // Gyroscope states
    const [isGyroEnabled, setIsGyroEnabled] = useState(false);
    const [showingGyroButton, setShowingGyroButton] = useState(true);
    const targetGravity = useRef({ x: 0, y: 0 });
    const currentGravity = useRef({ x: 0, y: 0 });

    // Cosmic background particles (stars/bubbles)
    const [particles] = useState(() =>
        Array.from({ length: 50 }).map(() => ({
            id: Math.random(),
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: Math.random() * 2 + 1,
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

            // Define an inner play area (e.g., 10% padding)
            const marginX = w * 0.12;
            const marginY = h * 0.18;
            const playWidth = w - marginX * 2;
            const playHeight = h - marginY * 2;

            const newWalls = [
                // Top
                Bodies.rectangle(w / 2, marginY - 10, playWidth, 20, { isStatic: true, restitution: 0.8 }),
                // Bottom
                Bodies.rectangle(w / 2, h - marginY + 10, playWidth, 20, { isStatic: true, restitution: 0.8 }),
                // Left
                Bodies.rectangle(marginX - 10, h / 2, 20, h - marginY * 2, { isStatic: true, restitution: 0.8 }),
                // Right
                Bodies.rectangle(w - marginX + 10, h / 2, 20, h - marginY * 2, { isStatic: true, restitution: 0.8 }),
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

        // Apply autonomous swimming forces
        Matter.Events.on(engine, 'beforeUpdate', () => {
            const allBodies = Matter.Composite.allBodies(engine.world);
            const forceMagnitudeBase = 0.0004;

            for (let i = 0; i < allBodies.length; i++) {
                const body = allBodies[i];
                if (body.isStatic) continue;

                // 1. Random current
                Matter.Body.applyForce(body, body.position, {
                    x: (Math.random() - 0.5) * forceMagnitudeBase * body.mass,
                    y: (Math.random() - 0.5) * forceMagnitudeBase * body.mass
                });

                // 2. Dynamic speed limit
                const speed = body.speed;
                if (speed > 3.5) {
                    Matter.Body.setVelocity(body, {
                        x: body.velocity.x * 0.98,
                        y: body.velocity.y * 0.98
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

        // Smoothing loop for gravity
        const smoothGravity = () => {
            if (engineRef.current) {
                const lerp = 0.05; // Smoothing factor
                currentGravity.current.x += (targetGravity.current.x - currentGravity.current.x) * lerp;
                currentGravity.current.y += (targetGravity.current.y - currentGravity.current.y) * lerp;

                engineRef.current.world.gravity.x = currentGravity.current.x;
                engineRef.current.world.gravity.y = currentGravity.current.y;
            }
            requestAnimationFrame(smoothGravity);
        };
        const gravityAnimId = requestAnimationFrame(smoothGravity);

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animId);
            cancelAnimationFrame(gravityAnimId);
            Matter.Runner.stop(runner);
            Engine.clear(engine);
        };
    }, []);

    // Gyroscope Logic
    useEffect(() => {
        if (!isGyroEnabled) {
            targetGravity.current = { x: 0, y: 0 };
            return;
        }

        const handleOrientation = (e: DeviceOrientationEvent) => {
            const beta = e.beta || 0; // -180 to 180
            const gamma = e.gamma || 0; // -90 to 90

            // Sensitivity and scaling
            const sensitivity = 0.008;

            // Map gamma to x, beta to y
            // We cap the values for stability
            const nextX = Math.max(-1, Math.min(1, gamma * sensitivity));
            const nextY = Math.max(-1, Math.min(1, (beta - 45) * sensitivity)); // Offset by 45 deg for natural holding angle

            targetGravity.current = { x: nextX, y: nextY };
        };

        window.addEventListener('deviceorientation', handleOrientation);
        return () => window.removeEventListener('deviceorientation', handleOrientation);
    }, [isGyroEnabled]);

    const requestGyroPermission = async () => {
        // iOS 13+ permission request
        if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
            try {
                const permission = await (DeviceOrientationEvent as any).requestPermission();
                if (permission === 'granted') {
                    setIsGyroEnabled(true);
                    setShowingGyroButton(false);
                }
            } catch (err) {
                console.error("Gyroscope permission denied:", err);
            }
        } else {
            // Non-iOS or older versions
            setIsGyroEnabled(true);
            setShowingGyroButton(false);
        }
    };

    // Add a shard
    const addShard = (text: string, categoryName: string) => {
        if (!engineRef.current) return;

        const id = Math.random().toString(36).substr(2, 9);
        const createdAt = Date.now();
        const categoryObj = categories.find(c => c.name === categoryName) || categories[0];
        const color = categoryObj.color;

        const x = Math.random() * (window.innerWidth * 0.6) + (window.innerWidth * 0.2);
        const y = Math.random() * (window.innerHeight * 0.5) + (window.innerHeight * 0.25);
        const radius = 35 + Math.random() * 20;

        const body = Matter.Bodies.circle(x, y, radius, {
            restitution: 0.8,
            frictionAir: 0.01,
        });

        Matter.Body.setVelocity(body, {
            x: (Math.random() - 0.5) * 3.0,
            y: (Math.random() - 0.5) * 3.0,
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

    const handleAddCategory = () => {
        if (!newCategoryName.trim()) return;
        if (categories.some(c => c.name === newCategoryName.trim())) {
            alert("이미 존재하는 카테고리입니다.");
            return;
        }

        const randomColor = NEW_CAT_COLORS[Math.floor(Math.random() * NEW_CAT_COLORS.length)];
        const newCat = {
            name: newCategoryName.trim(),
            ...randomColor
        };

        setCategories(prev => [...prev, newCat]);
        setNewCategoryName("");
        setIsAddingCategory(false);
        setSelectedCategory(newCat);
    };

    const handleDeleteCategory = (name: string) => {
        if (categories.length <= 1) {
            alert("최소 하나의 카테고리는 있어야 합니다.");
            return;
        }

        const newCats = categories.filter(c => c.name !== name);
        setCategories(newCats);

        if (selectedCategory.name === name) {
            setSelectedCategory(newCats[0]);
        }
    };

    const handleInteraction = (clientX: number, clientY: number, target: EventTarget) => {
        if (!engineRef.current || !sceneRef.current) return;

        // Ignore if clicking on UI elements
        const targetElement = target as HTMLElement;
        if (targetElement.closest('button') || targetElement.closest('input') || targetElement.closest('textarea')) {
            return;
        }

        const rect = sceneRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        // 1. Create visual ripple
        const rippleId = Date.now();
        setRipples(prev => [...prev, { id: rippleId, x, y }]);
        setTimeout(() => {
            setRipples(prev => prev.filter(r => r.id !== rippleId));
        }, 1000);

        // 2. Physical push to nearby shards
        const allBodies = Matter.Composite.allBodies(engineRef.current.world);
        const pushRadius = 250;
        const pushStrength = 0.12; // Slightly stronger for better feel

        allBodies.forEach(body => {
            if (body.isStatic) return;

            const dx = body.position.x - x;
            const dy = body.position.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < pushRadius) {
                const force = (1 - distance / pushRadius) * pushStrength;
                Matter.Body.applyForce(body, body.position, {
                    x: (dx / (distance || 1)) * force * body.mass,
                    y: (dy / (distance || 1)) * force * body.mass
                });
            }
        });
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

    const handleAuth = React.useCallback(async (username: string, password: string, isSignUp: boolean) => {
        setIsAuthLoading(true);
        // Convert ID to a virtual email format for Supabase
        const virtualEmail = `${username.trim().toLowerCase()}@seaglass.internal`;

        try {
            if (isSignUp) {
                const { data, error } = await supabase.auth.signUp({
                    email: virtualEmail,
                    password,
                });
                if (error) throw error;

                if (data.session) {
                    setUserId(data.user?.id || null);
                    setRegistrationMessage("가입을 축하합니다! 이제 당신만의 바다를 가꿀 수 있습니다.");
                } else if (data.user) {
                    setRegistrationMessage("가입이 완료되었습니다! 이제 로그인할 수 있습니다.");
                }
            } else {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: virtualEmail,
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
                        const x = Math.random() * (window.innerWidth * 0.6) + (window.innerWidth * 0.2);
                        const y = Math.random() * (window.innerHeight * 0.5) + (window.innerHeight * 0.25);
                        const radius = 35 + Math.random() * 20;

                        const body = Matter.Bodies.circle(x, y, radius, {
                            restitution: 0.8,
                            frictionAir: 0.01,
                        });
                        Matter.Body.setVelocity(body, {
                            x: (Math.random() - 0.5) * 3.0,
                            y: (Math.random() - 0.5) * 3.0,
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
            <div className="cosmic-sea-bg pointer-events-none" />

            {/* Play Area Frame Visual Only - Minimal */}
            <div
                className="absolute inset-[18vh_12vw] border border-white/5 rounded-[40px] pointer-events-none z-0 bg-white/[0.01]"
            >
                <div className="absolute inset-0 border border-white/5 rounded-[40px]" />
            </div>

            {/* Ripple & Interaction Layer - Behaves as the "background" for clicks */}
            <div
                className="absolute inset-0 z-10 cursor-crosshair overflow-hidden"
                onMouseDown={(e) => handleInteraction(e.clientX, e.clientY, e.target)}
                onTouchStart={(e) => {
                    const touch = e.touches[0];
                    handleInteraction(touch.clientX, touch.clientY, e.target);
                }}
            >
                <AnimatePresence>
                    {ripples.map(ripple => (
                        <motion.div
                            key={ripple.id}
                            initial={{ scale: 0, opacity: 0.6 }}
                            animate={{ scale: 4, opacity: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="absolute rounded-full border border-white/30 bg-white/5 pointer-events-none"
                            style={{
                                left: ripple.x,
                                top: ripple.y,
                                width: 100,
                                height: 100,
                                marginLeft: -50,
                                marginTop: -50,
                            }}
                        />
                    ))}
                </AnimatePresence>
            </div>

            {/* Background Particles (Optimized) */}
            <BackgroundParticles particles={particles} />

            {/* Input UI */}
            <div className="absolute top-6 sm:top-10 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4 sm:px-6">
                <div className="flex flex-col gap-3 sm:gap-4">
                    {/* Category Selection - Scrollable on mobile */}
                    <div className="flex items-center justify-start sm:justify-center gap-2 overflow-x-auto pb-2 no-scrollbar px-2">
                        {categories.map((cat) => (
                            <div key={cat.name} className="relative group/cat shrink-0">
                                <button
                                    onClick={() => setSelectedCategory(cat)}
                                    className={`whitespace-nowrap px-5 py-2.5 rounded-full text-[11px] sm:text-xs tracking-wider transition-all border font-medium ${selectedCategory.name === cat.name
                                        ? "text-white shadow-xl scale-105"
                                        : "bg-white/5 border-white/5 text-white/30 hover:bg-white/10 hover:text-white/60"
                                        }`}
                                    style={selectedCategory.name === cat.name ? {
                                        backgroundColor: cat.color,
                                        borderColor: cat.color,
                                        boxShadow: `0 0 20px ${cat.glow}66`
                                    } : {}}
                                >
                                    {cat.name}
                                </button>
                                {categories.length > 1 && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteCategory(cat.name);
                                        }}
                                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500/80 rounded-full flex items-center justify-center text-[8px] text-white opacity-0 group-hover/cat:opacity-100 transition-opacity shadow-lg"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        ))}

                        {/* Add Category Button */}
                        {!isAddingCategory ? (
                            <button
                                onClick={() => setIsAddingCategory(true)}
                                className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white/80 transition-all shrink-0 ml-1"
                            >
                                +
                            </button>
                        ) : (
                            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full pl-3 pr-1 py-1 shrink-0 animate-in fade-in slide-in-from-left-2 duration-300">
                                <input
                                    autoFocus
                                    type="text"
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                                    placeholder="이름..."
                                    className="bg-transparent border-none outline-none text-white text-[11px] w-16 px-1 lowercase"
                                />
                                <button
                                    onClick={handleAddCategory}
                                    className="w-6 h-6 rounded-full bg-blue-500/40 flex items-center justify-center text-[10px] text-white hover:bg-blue-500/60 transition-all"
                                >
                                    ✓
                                </button>
                                <button
                                    onClick={() => {
                                        setIsAddingCategory(false);
                                        setNewCategoryName("");
                                    }}
                                    className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[10px] text-white/40 hover:bg-white/10 transition-all"
                                >
                                    ✕
                                </button>
                            </div>
                        )}
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
                            className="flex-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl sm:rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-sm sm:text-base text-white placeholder-white/40 outline-none transition-all font-light focus:ring-2"
                            style={{
                                focusRingColor: selectedCategory.color + '44',
                                borderColor: selectedCategory.color + '33'
                            } as any}
                        />
                        <button
                            className="backdrop-blur-xl text-white border rounded-xl sm:rounded-2xl px-5 sm:px-8 py-3 sm:py-4 transition-all text-sm sm:text-base font-semibold shadow-lg"
                            style={{
                                backgroundColor: selectedCategory.color + '33',
                                borderColor: selectedCategory.color + '55',
                                boxShadow: `0 0 15px ${selectedCategory.glow}22`
                            }}
                        >
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
                        onPointerDown={(e) => {
                            e.stopPropagation(); // CRITICAL: Stop event from reaching ripple layer
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveShard(shard);
                        }}
                        className="absolute cursor-pointer select-none group flex items-center justify-center overflow-hidden z-40 bg-white/5 border border-white/10 rounded-full"
                        style={{
                            left: 0,
                            top: 0,
                            width: radius * 2,
                            height: radius * 2,
                            backgroundColor: shard.color.replace('0.4', '0.08'),
                            boxShadow: "0 4px 15px rgba(0, 0, 0, 0.1)",
                            willChange: "transform",
                            transition: "box-shadow 0.3s ease, scale 0.2s ease",
                        }}
                    >
                        {/* Shard Text Content - Minimal */}
                        <div className="relative z-10 p-4 text-center pointer-events-none">
                            <p className="text-[11px] text-white/50 font-light leading-tight line-clamp-3 break-keep">
                                {shard.text}
                            </p>
                        </div>
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
                            initial={{ scale: 0.9, y: 30 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 30 }}
                            className="glass-card max-w-lg w-full p-8 sm:p-12 rounded-[30px] sm:rounded-[40px] text-center relative overflow-hidden bg-slate-900/40 border border-white/10"
                            onClick={(e) => e.stopPropagation()}
                        >

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

                {/* Gyroscope Toggle Button */}
                <button
                    onClick={() => {
                        if (isGyroEnabled) {
                            setIsGyroEnabled(false);
                        } else {
                            requestGyroPermission();
                        }
                    }}
                    className={`backdrop-blur-md border px-4 py-2 rounded-xl text-[10px] sm:text-xs tracking-[0.2em] font-medium uppercase transition-all shadow-lg flex items-center gap-2 ${isGyroEnabled
                            ? "bg-blue-500/30 border-blue-400/50 text-blue-100"
                            : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                        }`}
                >
                    <span className={`w-1.5 h-1.5 rounded-full ${isGyroEnabled ? "bg-blue-400 animate-pulse" : "bg-white/20"}`} />
                    {isGyroEnabled ? "Motion ON" : "Motion OFF"}
                </button>

                {userId && (
                    <button
                        onClick={handleLogout}
                        className="bg-white/5 hover:bg-red-500/20 backdrop-blur-md border border-white/10 hover:border-red-500/40 text-white/60 hover:text-red-400 px-4 py-2 rounded-xl text-[10px] sm:text-xs tracking-[0.2em] font-medium uppercase transition-all shadow-lg shadow-black/20"
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

// Sub-component for ID/Password Auth
const AuthOverlay = React.memo(({ onAuth }: { onAuth: (id: string, password: string, isSignUp: boolean) => Promise<{ success: boolean, error?: string }> }) => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [isSignUp, setIsSignUp] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password.trim()) return;
        setLoading(true);
        setErrorMsg("");
        setSuccessMsg("");
        const result = await onAuth(username.trim(), password, isSignUp);
        if (result.success) {
            if (isSignUp) {
                setSuccessMsg("가입이 완료되었습니다! 이제 로그인할 수 있습니다.");
            }
        } else if (result.error) {
            // Translate common Supabase Auth errors to Korean for better UX
            let translatedError = result.error;
            if (result.error.includes("rate limit")) translatedError = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
            else if (result.error.includes("Invalid login credentials")) translatedError = "아이디 또는 비밀번호가 올바르지 않습니다.";
            else if (result.error.includes("already registered")) translatedError = "이미 존재하는 아이디입니다.";
            else if (result.error.includes("Password should be at least")) translatedError = "비밀번호는 최소 6자 이상이어야 합니다.";
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
                className="glass-card max-w-md w-full p-8 sm:p-12 rounded-[40px] text-center border border-white/10 shadow-2xl relative overflow-hidden bg-slate-900/40"
            >

                <div className="relative z-10">
                    <h2 className="text-2xl sm:text-3xl font-light text-blue-100 mb-2 tracking-tight">
                        {isSignUp ? "기억의 시작" : "다시 만나요"}
                    </h2>
                    <p className="text-blue-400/60 text-xs sm:text-sm mb-10 font-light">
                        {isSignUp ? "당신의 소중한 조각들을 모을 준비를 하세요" : "당신의 우주 바다가 기다리고 있습니다"}
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1 text-left">
                            <label className="text-[10px] uppercase tracking-widest text-blue-300/40 ml-4">ID</label>
                            <input
                                type="text"
                                placeholder="사용자 아이디"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
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

                        <button
                            disabled={loading}
                            className="w-full mt-6 bg-white/5 hover:bg-white/10 text-white rounded-2xl py-4 transition-all tracking-[0.2em] uppercase text-xs font-medium disabled:opacity-50 border border-white/10"
                        >
                            {loading ? "작업 중..." : (isSignUp ? "가입하기" : "로그인")}
                        </button>

                        {/* Success & Error Messages Displayed Below */}
                        <AnimatePresence>
                            {successMsg && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="text-emerald-400 text-xs sm:text-sm font-light mt-4 bg-emerald-500/10 py-3 px-4 rounded-xl border border-emerald-500/20"
                                >
                                    {successMsg}
                                </motion.div>
                            )}
                            {errorMsg && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="text-red-400 text-xs sm:text-sm font-light mt-4 bg-red-500/10 py-3 px-4 rounded-xl border border-red-500/20"
                                >
                                    {errorMsg}
                                </motion.div>
                            )}
                        </AnimatePresence>
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
