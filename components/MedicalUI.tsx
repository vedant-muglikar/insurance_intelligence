'use client';
import React, { useState } from 'react';
import { Home, Calendar, FileText, User, Search, Bell, Heart, Star, ChevronRight, ChevronLeft, ArrowUpRight } from 'lucide-react';

export default function MedicalUI() {
  const [selectedDate, setSelectedDate] = useState(15);
  
  const dates = [
    { day: 'Mon', num: 12 },
    { day: 'Tue', num: 13 },
    { day: 'Wed', num: 14 },
    { day: 'Thu', num: 15 },
    { day: 'Fri', num: 16 },
    { day: 'Sat', num: 17 },
    { day: 'Sun', num: 18 },
  ];

  const doctors = [
    { id: 1, name: 'Dr. Saif Ababon', role: 'Cardiologist', rating: 4.8, reviews: 95 },
    { id: 2, name: 'Dr. Johan Janson', role: 'Endocrinologist', rating: 4.5, reviews: 120 },
    { id: 3, name: 'Dr. Marilyn Stanton', role: 'General Physician', rating: 5.0, reviews: 89 },
    { id: 4, name: 'Dr. Marvin McKinney', role: 'Cardiologist', rating: 4.3, reviews: 65, active: true },
    { id: 5, name: 'Dr. Arlene McCoy', role: 'Physician', rating: 4.5, reviews: 102 },
  ];

  return (
    <div className="min-h-screen bg-[#a7c5c0] flex items-center justify-center p-8 gap-8 overflow-x-auto font-sans text-slate-800">
      
      {/* SCREEN 1: Home Dashboard */}
      <div className="w-[360px] h-[780px] bg-[#f7fbf9] rounded-[40px] shadow-2xl overflow-hidden flex flex-col relative border-4 border-white">
        {/* Header */}
        <div className="p-6 flex justify-between items-center bg-white/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden shadow-inner">
              <img src="https://i.pravatar.cc/100?img=11" alt="User" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Hello, Martin</p>
              <p className="text-sm font-bold text-slate-800">15 February, 2025</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-600 hover:text-teal-600 transition-colors">
              <Search size={18} />
            </button>
            <button className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-600 relative hover:text-teal-600 transition-colors">
              <Bell size={18} />
              <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-28 custom-scrollbar">
          {/* Top Doctors Banner */}
          <div className="flex justify-between items-end mb-4 mt-2">
            <h2 className="text-lg font-bold text-slate-800">Top Doctors</h2>
            <button className="text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors">See all</button>
          </div>
          
          <div className="bg-[#129f8c] rounded-3xl p-5 text-white relative overflow-hidden shadow-lg shadow-teal-900/20 group cursor-pointer transition-transform hover:scale-[1.02]">
            <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-white/10 rounded-full blur-2xl"></div>
            <div className="flex justify-between items-start relative z-10">
              <div className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-1 text-xs font-semibold">
                <Star size={12} className="text-yellow-400 fill-yellow-400" /> 4.8
              </div>
              <button className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white hover:text-teal-600 transition-colors">
                <Heart size={14} className="text-white group-hover:text-teal-600" />
              </button>
            </div>
            
            <div className="mt-4 relative z-10">
              <p className="text-xs text-teal-100 font-medium">Arthropathic</p>
              <h3 className="text-xl font-bold mt-1">Dr. Johan<br/>Janson</h3>
              <p className="text-xs mt-2 font-medium opacity-90"><span className="text-lg font-bold">$95</span>/session</p>
            </div>

            <div className="absolute right-[-10px] bottom-0 w-36 h-48 pointer-events-none">
                <img src="https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?q=80&w=200&auto=format&fit=crop" alt="Doctor" className="w-full h-full object-cover rounded-tl-full rounded-tr-full mix-blend-luminosity opacity-80" />
            </div>

            {/* Date scroller in banner */}
            <div className="mt-6 bg-white/10 backdrop-blur-md rounded-2xl p-3 relative z-10 border border-white/20">
              <div className="flex justify-between text-[10px] font-medium text-teal-100 mb-2 px-1">
                <span>Availability • 4 Slots</span>
                <span>February 2025</span>
              </div>
              <div className="flex justify-between">
                {dates.slice(0, 5).map((d) => (
                  <div key={d.day} className={`flex flex-col items-center p-1.5 rounded-xl cursor-pointer transition-colors ${d.num === selectedDate ? 'bg-white text-teal-700 shadow-sm' : 'hover:bg-white/20'}`}>
                    <span className="text-[9px] mb-1 opacity-90">{d.day}</span>
                    <span className="text-xs font-bold">{d.num}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Disease Monitoring */}
          <div className="flex justify-between items-end mb-4 mt-8">
            <h2 className="text-lg font-bold text-slate-800">Disease<br/>monitoring</h2>
            <div className="flex gap-2">
               <button className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors"><ChevronLeft size={16}/></button>
               <button className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-800 hover:bg-slate-50 transition-colors"><ChevronRight size={16}/></button>
            </div>
          </div>
          
          <div className="flex gap-4">
            <div className="bg-white rounded-[24px] p-4 flex-1 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 group cursor-pointer hover:border-teal-100 transition-colors">
              <h4 className="text-sm font-bold text-slate-800 h-10">Bechterew's<br/>disease</h4>
              <div className="mt-8 flex justify-between items-end">
                <div className="text-red-500 font-bold flex items-center gap-1">
                  <ArrowUpRight size={16} /> 2%
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors">
                   <ArrowUpRight size={16} />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-[24px] p-4 flex-1 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 group cursor-pointer hover:border-teal-100 transition-colors">
              <h4 className="text-sm font-bold text-slate-800 h-10">Migraine</h4>
              <div className="mt-8 flex justify-between items-end">
                <div className="text-slate-800 font-bold flex items-center gap-1">
                  <img src="https://cdn-icons-png.flaticon.com/512/3004/3004458.png" className="w-5 h-5 opacity-70" alt="brain" />
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors">
                   <ArrowUpRight size={16} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Navigation */}
        <div className="absolute bottom-6 left-6 right-6 bg-white rounded-full p-2 flex justify-between shadow-[0_10px_40px_rgb(0,0,0,0.1)] border border-slate-100 z-20">
          <button className="flex items-center gap-2 bg-[#129f8c] text-white px-5 py-3 rounded-full font-medium text-sm transition-transform hover:scale-105">
            <Home size={18} /> Home
          </button>
          <button className="p-3 text-slate-400 hover:text-teal-600 transition-colors rounded-full hover:bg-teal-50"><Calendar size={20} /></button>
          <button className="p-3 text-slate-400 hover:text-teal-600 transition-colors rounded-full hover:bg-teal-50"><FileText size={20} /></button>
          <button className="p-3 text-slate-400 hover:text-teal-600 transition-colors rounded-full hover:bg-teal-50"><User size={20} /></button>
        </div>
      </div>

      {/* SCREEN 2: Doctor Profile */}
      <div className="w-[360px] h-[780px] bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col relative border-4 border-white mt-12">
        <div className="h-[45%] bg-[#f4f7f6] relative rounded-b-[40px] p-6 pt-10">
          <div className="flex justify-between relative z-20">
            <button className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-600 hover:text-teal-600 transition-colors">
              <ChevronLeft size={20} />
            </button>
            <button className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-600 hover:text-teal-600 transition-colors">
              <Heart size={18} />
            </button>
          </div>
          
          <div className="mt-8 relative z-20">
            <p className="text-xs text-slate-500 font-medium">Cardiologist</p>
            <h2 className="text-2xl font-bold text-slate-800 mt-1">Dr. Saif Ababon</h2>
            <div className="inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-full mt-3 shadow-sm border border-slate-100">
               <span className="w-2 h-2 rounded-full bg-[#129f8c]"></span>
               <span className="text-xs font-semibold text-slate-700">ID 32145661</span>
            </div>
          </div>
          
          <img src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?q=80&w=400&auto=format&fit=crop" alt="Doctor" className="absolute bottom-0 right-[-20px] w-64 object-contain drop-shadow-xl z-10" style={{ clipPath: 'inset(0 0 0 0)'}} />
        </div>

        <div className="flex-1 px-6 pt-6 pb-24 overflow-y-auto">
          <div className="flex justify-center gap-4 mb-8">
             <button className="w-12 h-12 rounded-2xl border border-slate-200 flex items-center justify-center text-slate-500 hover:border-teal-200 hover:text-teal-600 transition-colors shadow-sm"><FileText size={20} /></button>
             <button className="px-6 h-12 rounded-2xl bg-[#129f8c] flex items-center gap-2 text-white font-bold text-sm shadow-lg shadow-teal-900/20 hover:bg-teal-600 transition-colors"><Star size={16} className="fill-white"/> Rating 4.8</button>
             <button className="w-12 h-12 rounded-2xl border border-slate-200 flex items-center justify-center text-slate-500 hover:border-teal-200 hover:text-teal-600 transition-colors shadow-sm"><Calendar size={20} /></button>
          </div>

          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800">January 2025</h3>
            <div className="flex gap-2 text-slate-400">
              <ChevronLeft size={16} className="cursor-pointer hover:text-teal-600" />
              <ChevronRight size={16} className="cursor-pointer hover:text-teal-600" />
            </div>
          </div>

          <div className="flex justify-between mb-8">
            {dates.map((d) => (
              <div key={d.day} onClick={() => setSelectedDate(d.num)} className={`flex flex-col items-center p-2 rounded-2xl cursor-pointer transition-all ${d.num === selectedDate ? 'bg-[#129f8c] text-white shadow-lg shadow-teal-900/20 transform scale-110' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-100'}`}>
                <span className="text-[10px] mb-1 font-medium">{d.day}</span>
                <span className="text-sm font-bold">{d.num}</span>
              </div>
            ))}
          </div>

          <div className="bg-[#f7fbf9] rounded-[24px] p-5 border border-teal-50">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Today,</h4>
                <p className="font-bold text-slate-800 text-sm">Availability</p>
              </div>
              <span className="text-xs font-semibold text-slate-400 bg-white px-2 py-1 rounded-md shadow-sm border border-slate-100">4 Slots</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <button className="py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 font-semibold text-xs hover:border-teal-300 hover:text-teal-700 transition-colors shadow-sm">04:30 PM</button>
              <button className="py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 font-semibold text-xs hover:border-teal-300 hover:text-teal-700 transition-colors shadow-sm">05:00 PM</button>
              <button className="py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 font-semibold text-xs hover:border-teal-300 hover:text-teal-700 transition-colors shadow-sm">07:00 PM</button>
              <button className="py-2.5 rounded-xl bg-white border border-[#129f8c] text-[#129f8c] font-semibold text-xs shadow-sm bg-teal-50">08:30 PM</button>
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 left-6 right-6 z-20">
          <button className="w-full bg-[#129f8c] text-white py-4 rounded-2xl font-bold text-sm shadow-lg shadow-teal-900/20 hover:bg-teal-600 transition-colors transform hover:-translate-y-1">
            Book Appointment
          </button>
        </div>
      </div>

      {/* SCREEN 3: Doctors List */}
      <div className="w-[360px] h-[780px] bg-[#f7fbf9] rounded-[40px] shadow-2xl overflow-hidden flex flex-col relative border-4 border-white mt-24">
        <div className="p-6 pb-2 pt-10 sticky top-0 bg-[#f7fbf9]/90 backdrop-blur-md z-20">
          <div className="flex justify-between items-center mb-6">
             <button className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-600 hover:text-teal-600 transition-colors">
              <ChevronLeft size={20} />
            </button>
            <h2 className="font-bold text-slate-800 text-lg">Doctors List</h2>
            <button className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-600 hover:text-teal-600 transition-colors">
              <span className="w-4 h-1 bg-slate-300 rounded-full"></span>
            </button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Search for doctor..." className="w-full bg-white border border-slate-100 rounded-2xl py-3.5 pl-12 pr-12 text-sm font-medium text-slate-700 focus:outline-none focus:border-teal-300 shadow-sm transition-colors placeholder-slate-400" />
            <button className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-teal-600">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pt-4 pb-28 custom-scrollbar">
          <div className="grid grid-cols-2 gap-4">
            {doctors.map(doc => (
              <div key={doc.id} className={`rounded-[24px] p-4 cursor-pointer transition-all transform hover:-translate-y-1 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 ${doc.active ? 'bg-[#129f8c] text-white shadow-teal-900/20 border-transparent' : 'bg-white text-slate-800 hover:border-teal-200'}`}>
                <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 mb-3 border-2 border-white shadow-sm">
                   <img src={`https://i.pravatar.cc/150?img=${doc.id + 30}`} alt={doc.name} className="w-full h-full object-cover" />
                </div>
                <p className={`text-[10px] font-medium mb-1 ${doc.active ? 'text-teal-100' : 'text-slate-500'}`}>{doc.role}</p>
                <h4 className="font-bold text-sm leading-tight mb-4 h-8">{doc.name}</h4>
                <div className="flex justify-between items-end">
                  <div>
                    <div className="flex items-center gap-1 text-[11px] font-bold mb-0.5">
                      <Star size={10} className="fill-yellow-400 text-yellow-400"/> {doc.rating}
                    </div>
                    <p className={`text-[9px] ${doc.active ? 'text-teal-100' : 'text-slate-400'}`}>{doc.reviews} Reviews</p>
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${doc.active ? 'bg-white/20 text-white hover:bg-white hover:text-teal-700' : 'bg-slate-50 text-slate-400 hover:bg-teal-50 hover:text-teal-600'}`}>
                     <ArrowUpRight size={14} />
                  </div>
                </div>
              </div>
            ))}
            
            {/* Extra empty card for layout */}
             <div className="rounded-[24px] p-4 bg-white shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 hover:border-teal-200 transition-colors cursor-pointer">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 mb-3 border-2 border-white shadow-sm">
                   <img src="https://i.pravatar.cc/150?img=40" alt="Doctor" className="w-full h-full object-cover" />
                </div>
                <p className="text-[10px] font-medium mb-1 text-slate-500">Endocrinologist</p>
                <h4 className="font-bold text-sm leading-tight mb-4 h-8">Dr. Kaiya Donin</h4>
                <div className="flex justify-between items-end">
                  <div>
                    <div className="flex items-center gap-1 text-[11px] font-bold mb-0.5">
                      <Star size={10} className="fill-yellow-400 text-yellow-400"/> 5.0
                    </div>
                    <p className="text-[9px] text-slate-400">85 Reviews</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-teal-50 hover:text-teal-600 transition-colors">
                     <ArrowUpRight size={14} />
                  </div>
                </div>
              </div>
          </div>
        </div>

        {/* Bottom Navigation */}
        <div className="absolute bottom-6 left-6 right-6 bg-white rounded-full p-2 flex justify-between shadow-[0_10px_40px_rgb(0,0,0,0.1)] border border-slate-100 z-20">
          <button className="p-3 text-slate-400 hover:text-teal-600 transition-colors rounded-full hover:bg-teal-50"><Home size={20} /></button>
          <button className="flex items-center gap-2 bg-[#129f8c] text-white px-5 py-3 rounded-full font-medium text-sm shadow-md transition-transform hover:scale-105">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            Doctors
          </button>
          <button className="p-3 text-slate-400 hover:text-teal-600 transition-colors rounded-full hover:bg-teal-50"><FileText size={20} /></button>
          <button className="p-3 text-slate-400 hover:text-teal-600 transition-colors rounded-full hover:bg-teal-50"><User size={20} /></button>
        </div>
      </div>

    </div>
  );
}
