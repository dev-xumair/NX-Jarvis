/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAgent } from '../../context/AgentContext.tsx';
import { Avatar3DStage } from '../avatar/Avatar3DStage.tsx';
import {
  Mic,
  MicOff,
  VolumeX,
  Minimize2,
  Maximize2,
  ArrowRightToLine,
  ArrowLeftToLine,
  Sparkles,
  Move,
  X,
  Armchair,
  UserCheck,
  AppWindow,
  MousePointer,
  Home,
} from 'lucide-react';
import { characterSeatManager } from '../../services/characterSeatManager.ts';

export const DesktopCompanion: React.FC = () => {
  const {
    companion,
    controlCompanion,
    agentState,
    isListening,
    isSpeaking,
    liveTranscript,
    micVolume,
    startVoiceListening,
    stopVoiceListening,
    bargeInInterrupt,
  } = useAgent();

  const [position, setPosition] = useState({ x: 30, y: 70 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      setPosition({
        x: Math.max(10, Math.min(window.innerWidth - 300, dragStartRef.current.posX + dx)),
        y: Math.max(10, Math.min(window.innerHeight - 380, dragStartRef.current.posY + dy)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const isHidden = companion.dockPosition === 'hidden';
  const isSideDocked = companion.dockPosition === 'side_right' || companion.dockPosition === 'side_left';
  const isSmall = companion.scale === 'small';
  const isLarge = companion.scale === 'large';
  const isSitting = companion.posture === 'sitting' || companion.animationState === 'SITTING';
  const isAttached = companion.visualMode === 'APPLICATION_ATTACHED' || companion.attachedWindow !== null;

  const containerWidth = isSmall ? 'w-56' : isLarge ? 'w-88' : 'w-72';

  if (isHidden) {
    return (
      <button
        onClick={() => controlCompanion({ dockPosition: 'dock_bottom_right', command: 'restore' })}
        className="fixed bottom-6 right-6 z-50 p-3 rounded-full shadow-2xl flex items-center gap-2 border bg-slate-900/95 border-emerald-400 text-emerald-400 hover:scale-105 transition-all cursor-pointer backdrop-blur-md"
        title="NX AI Anime Companion ko samne layein"
      >
        <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
        <span className="text-xs font-semibold pr-1">Saba Samne Aao</span>
      </button>
    );
  }

  return (
    <div
      className={`fixed z-50 select-none transition-transform duration-200 ${
        companion.isFloating ? '' : 'bottom-6 right-6'
      }`}
      style={companion.isFloating ? { left: `${position.x}px`, top: `${position.y}px` } : {}}
    >
      <div
        className={`relative flex flex-col items-center transition-all ${
          isSideDocked ? 'translate-x-14 opacity-90 hover:translate-x-0 hover:opacity-100' : ''
        } ${containerWidth}`}
      >
        {/* Modern Floating Speech / Caption Bubble */}
        {(companion.lastSpokenPhrase || liveTranscript || isListening) && (
          <div
            className="mb-2 w-full p-3 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all text-xs font-sans relative"
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.94)',
              borderColor: isListening
                ? '#10b981'
                : isSpeaking
                ? '#38bdf8'
                : 'rgba(56, 189, 248, 0.3)',
              boxShadow: isListening
                ? '0 0 20px rgba(16, 185, 129, 0.3)'
                : isSpeaking
                ? '0 0 20px rgba(56, 189, 248, 0.3)'
                : '0 10px 25px rgba(0,0,0,0.4)',
            }}
          >
            {/* Speech bubble pointer arrow */}
            <div
              className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-r border-b"
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.94)',
                borderColor: isListening
                  ? '#10b981'
                  : isSpeaking
                  ? '#38bdf8'
                  : 'rgba(56, 189, 248, 0.3)',
              }}
            />

            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: isListening
                      ? '#10b981'
                      : isSpeaking
                      ? '#38bdf8'
                      : '#38bdf8',
                  }}
                />
                <span className="font-bold text-[11px] text-sky-400">Saba (NX AI)</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {isListening ? 'Sunte huwe...' : isSpeaking ? 'Bolte huwe...' : 'Desktop Companion'}
                </span>
              </div>

              {isSpeaking && (
                <button
                  onClick={bargeInInterrupt}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-rose-950/80 text-rose-300 border border-rose-800 flex items-center gap-1 hover:bg-rose-900 cursor-pointer"
                  title="Interrupt speaking (Barge-in)"
                >
                  <VolumeX className="w-2.5 h-2.5" />
                  <span>Ruko</span>
                </button>
              )}
            </div>

            <p className="text-slate-100 leading-relaxed font-medium">
              {isListening && liveTranscript ? (
                <span className="italic text-emerald-300">&ldquo;{liveTranscript}&rdquo;</span>
              ) : (
                companion.lastSpokenPhrase || companion.currentThought
              )}
            </p>
          </div>
        )}

        {/* Character Visual Stage with 3D WebGL Avatar */}
        <div className="relative group flex flex-col items-center w-full">
          {/* Draggable Header Handle & Control Toolbar (Floating on hover) */}
          <div className="absolute -top-7 flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 px-2 py-1 rounded-full shadow-lg text-slate-300 text-xs backdrop-blur-md opacity-90 group-hover:opacity-100 transition-opacity z-30">
            <div
              onMouseDown={handleMouseDown}
              className="flex items-center gap-1 cursor-grab active:cursor-grabbing text-slate-200 hover:text-white px-1"
              title="Drag to reposition on screen"
            >
              <Move className="w-3 h-3 text-sky-400" />
                <span className="text-[11px] font-semibold">{companion.assistantName || 'Saba'}</span>
            </div>

              {/* Sit / Stand toggle */}
              <button
                onClick={() =>
                  controlCompanion({
                    characterPose: 'full',
                    command: isSitting ? 'stand' : 'sit',
                  } as any)
                }
                className="p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer text-slate-400 hover:text-sky-300"
                title={isSitting ? 'Khari ho jao (Stand)' : 'Beth jao (Sit)'}
              >
                {isSitting ? <UserCheck className="w-3 h-3 text-emerald-400" /> : <Armchair className="w-3 h-3 text-sky-400" />}
              </button>

              {/* Browser / App Window Attachment Toggle */}
              <button
                onClick={() => {
                  if (isAttached) {
                    controlCompanion({
                      command: 'restore',
                    } as any);
                  } else {
                    controlCompanion({
                      command: 'attach_browser',
                    } as any);
                  }
                }}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  isAttached ? 'text-amber-400 bg-amber-950/60' : 'hover:bg-slate-800 text-slate-400 hover:text-amber-300'
                }`}
                title={isAttached ? 'Detach from window' : 'Chrome / App Window par attach karein'}
              >
                <AppWindow className="w-3 h-3" />
              </button>

              {/* Return to Desktop Home Center */}
              <button
                onClick={() =>
                  controlCompanion({
                    dockPosition: 'center',
                    isFloating: true,
                    command: 'center',
                  } as any)
                }
                className="p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer text-slate-400 hover:text-sky-300"
                title="Beech mein jaake beth jaye (Center Home)"
              >
                <Home className="w-3 h-3" />
              </button>

            {/* Scale toggle */}
            <button
              onClick={() =>
                controlCompanion({
                  scale: isSmall ? 'medium' : isLarge ? 'small' : 'large',
                })
              }
              className="p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer text-slate-400 hover:text-sky-300"
              title={isSmall ? 'Badi ho jao' : 'Chhoti ho jao'}
            >
              {isSmall ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
            </button>

            {/* Side Dock toggle ("Side mein chup jao") */}
            <button
              onClick={() =>
                controlCompanion({
                  dockPosition: isSideDocked ? 'dock_bottom_right' : 'side_right',
                  scale: isSideDocked ? 'medium' : 'small',
                })
              }
              className="p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer text-slate-400 hover:text-sky-300"
              title={isSideDocked ? 'Wapas aa jao' : 'Side mein chup jao'}
            >
              {isSideDocked ? <ArrowLeftToLine className="w-3 h-3" /> : <ArrowRightToLine className="w-3 h-3" />}
            </button>

            {/* Free floating toggle */}
            <button
              onClick={() => controlCompanion({ isFloating: !companion.isFloating })}
              className={`p-1 rounded transition-colors cursor-pointer ${
                companion.isFloating ? 'text-sky-400 bg-sky-950/60' : 'hover:bg-slate-800 text-slate-400'
              }`}
              title={companion.isFloating ? 'Lock to corner' : 'Free floating'}
            >
              <Sparkles className="w-3 h-3" />
            </button>

            {/* Hide */}
            <button
              onClick={() => controlCompanion({ dockPosition: 'hidden' })}
              className="p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer text-slate-400 hover:text-rose-400"
              title="Hide Companion"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* Transparent Living 3D WebGL Anime Avatar Stage */}
          <div
            className={`relative rounded-3xl overflow-hidden border transition-all duration-300 w-full shadow-2xl flex items-center justify-center`}
            style={{
              backgroundColor: 'rgba(10, 15, 24, 0.4)', // Translucent glass backdrop
              borderColor: isListening
                ? '#10b981'
                : isSpeaking
                ? '#38bdf8'
                : agentState === 'THINKING'
                ? '#f59e0b'
                : 'rgba(56, 189, 248, 0.25)',
              boxShadow: isListening
                ? '0 0 35px rgba(16, 185, 129, 0.35)'
                : isSpeaking
                ? '0 0 35px rgba(56, 189, 248, 0.35)'
                : '0 12px 30px rgba(0, 0, 0, 0.5)',
            }}
          >
            {/* 3D WebGL Canvas */}
            <Avatar3DStage
              mode="companion"
              agentState={agentState}
              animationState={companion.animationState || (isSitting ? 'SITTING' : 'IDLE')}
              posture={companion.posture || (isSitting ? 'sitting' : 'standing')}
              expression={companion.expression || 'FRIENDLY'}
              isSpeaking={isSpeaking}
              micVolume={micVolume / 100}
              spokenText=""
              assistantName={companion.assistantName || 'Saba'}
              className="w-full"
            />

            {/* Mic / Voice Interaction Action Button Floating at Bottom */}
            <div className="absolute bottom-2 inset-x-3 flex items-center justify-between pointer-events-auto z-20">
              <button
                onClick={isListening ? stopVoiceListening : startVoiceListening}
                className={`p-2 rounded-full shadow-xl border flex items-center justify-center transition-all cursor-pointer ${
                  isListening
                    ? 'bg-rose-500 border-rose-300 text-white animate-pulse shadow-rose-500/40'
                    : 'bg-emerald-500 border-emerald-300 text-white hover:scale-110 shadow-emerald-500/40'
                }`}
                title={isListening ? 'Awaaz rokain' : 'Saba se baat karein (Voice)'}
              >
                {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              </button>

              {/* Live Animated Voice Equalizer Strip */}
              {(isListening || isSpeaking) && (
                <div className="flex items-center gap-0.5 bg-slate-900/90 border border-slate-700/80 px-2 py-1 rounded-full">
                  {[8, 14, 20, 12, 16, 6].map((baseH, i) => {
                    const dynamicHeight =
                      isListening && micVolume > 0
                        ? Math.max(5, Math.min(20, Math.round(baseH * (0.4 + (micVolume / 100) * 1.4))))
                        : baseH;
                    return (
                      <div
                        key={i}
                        className={`w-0.5 rounded-full ${
                          isListening ? 'bg-emerald-400' : 'bg-sky-400'
                        } transition-all duration-75`}
                        style={{ height: `${dynamicHeight}px` }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
