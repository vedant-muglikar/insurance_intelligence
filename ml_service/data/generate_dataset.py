import os
import numpy as np
import pandas as pd

PROCEDURE_CATALOG = {
    "Cataract Surgery": {
        "icd_code": "H26.9",
        "base_stay_mean": 1.2,
        "base_stay_std": 0.4,
        "base_surgery_ot": 22000,
        "base_daily_room": 3500,
        "base_daily_doctor": 2500,
        "base_medicines_implants": 12000,
        "base_consumables": 3000,
    },
    "Appendectomy": {
        "icd_code": "K35.8",
        "base_stay_mean": 3.0,
        "base_stay_std": 0.8,
        "base_surgery_ot": 38000,
        "base_daily_room": 4500,
        "base_daily_doctor": 3000,
        "base_medicines_implants": 15000,
        "base_consumables": 5000,
    },
    "Total Knee Replacement": {
        "icd_code": "M17.1",
        "base_stay_mean": 5.5,
        "base_stay_std": 1.2,
        "base_surgery_ot": 110000,
        "base_daily_room": 6000,
        "base_daily_doctor": 5000,
        "base_medicines_implants": 95000,
        "base_consumables": 14000,
    },
    "Normal Delivery": {
        "icd_code": "O80",
        "base_stay_mean": 2.5,
        "base_stay_std": 0.6,
        "base_surgery_ot": 20000,
        "base_daily_room": 4000,
        "base_daily_doctor": 3500,
        "base_medicines_implants": 8000,
        "base_consumables": 4000,
    },
    "Caesarean Section": {
        "icd_code": "O82",
        "base_stay_mean": 4.0,
        "base_stay_std": 0.9,
        "base_surgery_ot": 45000,
        "base_daily_room": 5000,
        "base_daily_doctor": 4000,
        "base_medicines_implants": 18000,
        "base_consumables": 7000,
    },
    "Cholecystectomy": {
        "icd_code": "K80.2",
        "base_stay_mean": 3.2,
        "base_stay_std": 0.8,
        "base_surgery_ot": 42000,
        "base_daily_room": 4800,
        "base_daily_doctor": 3500,
        "base_medicines_implants": 16000,
        "base_consumables": 6000,
    },
    "Coronary Angioplasty": {
        "icd_code": "I25.1",
        "base_stay_mean": 3.5,
        "base_stay_std": 1.0,
        "base_surgery_ot": 85000,
        "base_daily_room": 7000,
        "base_daily_doctor": 6000,
        "base_medicines_implants": 75000,
        "base_consumables": 12000,
    },
    "Hernia Repair": {
        "icd_code": "K40.9",
        "base_stay_mean": 2.5,
        "base_stay_std": 0.7,
        "base_surgery_ot": 32000,
        "base_daily_room": 4200,
        "base_daily_doctor": 3000,
        "base_medicines_implants": 14000,
        "base_consumables": 4500,
    },
    "Dengue Inpatient Care": {
        "icd_code": "A90",
        "base_stay_mean": 4.5,
        "base_stay_std": 1.3,
        "base_surgery_ot": 0,  # Non-surgical medical management
        "base_daily_room": 4000,
        "base_daily_doctor": 3500,
        "base_medicines_implants": 12000,
        "base_consumables": 6000,
    },
    "Coronary Artery Bypass Graft (CABG)": {
        "icd_code": "I25.12",
        "base_stay_mean": 8.0,
        "base_stay_std": 2.0,
        "base_surgery_ot": 180000,
        "base_daily_room": 9000,
        "base_daily_doctor": 7500,
        "base_medicines_implants": 85000,
        "base_consumables": 22000,
    },
    "Hysterectomy": {
        "icd_code": "N80.9",
        "base_stay_mean": 4.2,
        "base_stay_std": 1.0,
        "base_surgery_ot": 52000,
        "base_daily_room": 5000,
        "base_daily_doctor": 4000,
        "base_medicines_implants": 20000,
        "base_consumables": 7500,
    },
    "Kidney Stone Lithotripsy": {
        "icd_code": "N20.1",
        "base_stay_mean": 2.0,
        "base_stay_std": 0.5,
        "base_surgery_ot": 35000,
        "base_daily_room": 4500,
        "base_daily_doctor": 3000,
        "base_medicines_implants": 11000,
        "base_consumables": 4000,
    },
    "Typhoid Inpatient Care": {
        "icd_code": "A01.0",
        "base_stay_mean": 5.0,
        "base_stay_std": 1.2,
        "base_surgery_ot": 0,  # Non-surgical medical management
        "base_daily_room": 3500,
        "base_daily_doctor": 3000,
        "base_medicines_implants": 14000,
        "base_consumables": 5000,
    },
    "Total Hip Replacement": {
        "icd_code": "M16.1",
        "base_stay_mean": 6.0,
        "base_stay_std": 1.4,
        "base_surgery_ot": 125000,
        "base_daily_room": 6500,
        "base_daily_doctor": 5500,
        "base_medicines_implants": 105000,
        "base_consumables": 15000,
    },
    "Tonsillectomy": {
        "icd_code": "J35.0",
        "base_stay_mean": 1.8,
        "base_stay_std": 0.5,
        "base_surgery_ot": 25000,
        "base_daily_room": 3800,
        "base_daily_doctor": 2800,
        "base_medicines_implants": 7000,
        "base_consumables": 3200,
    },
}

CITY_TIER_MULTIPLIERS = {
    1: 1.40,  # Metro: +40% average (range +30% to +50%)
    2: 1.00,  # Tier 2 base
    3: 0.80,  # Tier 3: -20%
}

HOSPITAL_TIER_MULTIPLIERS = {
    1: 1.35,  # Corporate/NABH (+35%)
    2: 1.10,  # Multi-specialty (+10%)
    3: 0.85,  # Nursing Home (-15%)
}

ROOM_CATEGORY_MULTIPLIERS = {
    "general": 1.00,    # General Ward (0%)
    "twin": 1.15,       # Twin Sharing (+15%)
    "single": 1.35,     # Single Private (+35%)
    "suite": 1.65,      # Deluxe Suite (+65%)
}

def generate_dataset(num_records: int = 10000, seed: int = 42, output_path: str = None) -> pd.DataFrame:
    """
    Generates synthetic clinically grounded inpatient tariff records for Indian health procedures.
    """
    np.random.seed(seed)
    procedure_names = list(PROCEDURE_CATALOG.keys())
    
    records = []
    
    for _ in range(num_records):
        proc_name = np.random.choice(procedure_names)
        proc_info = PROCEDURE_CATALOG[proc_name]
        
        # Patient age: uniform distribution 18 to 82
        patient_age = int(np.random.randint(18, 83))
        
        # Complication multiplier for age > 60
        age_complication = 0.0
        if patient_age > 60:
            age_complication = (patient_age - 60) * 0.012  # up to ~26% extra variance/cost
            
        # City Tier (1: 40%, 2: 40%, 3: 20%)
        city_tier = int(np.random.choice([1, 2, 3], p=[0.4, 0.4, 0.2]))
        city_mult = CITY_TIER_MULTIPLIERS[city_tier] * np.random.uniform(0.95, 1.05)
        
        # Hospital Tier (1: 35%, 2: 45%, 3: 20%)
        hospital_tier = int(np.random.choice([1, 2, 3], p=[0.35, 0.45, 0.20]))
        hosp_mult = HOSPITAL_TIER_MULTIPLIERS[hospital_tier] * np.random.uniform(0.95, 1.05)
        
        # Room Category
        room_category = np.random.choice(["general", "twin", "single", "suite"], p=[0.3, 0.35, 0.25, 0.10])
        room_mult = ROOM_CATEGORY_MULTIPLIERS[room_category]
        
        # Stay duration (days)
        stay_mean = proc_info["base_stay_mean"] + (1.5 if patient_age > 65 else 0.0)
        stay_std = proc_info["base_stay_std"]
        stay_duration_days = max(1, int(np.round(np.random.normal(stay_mean, stay_std))))
        
        # Heteroscedastic noise (higher age/corporate hospital => higher cost variance)
        noise_factor = np.random.normal(1.0, 0.08 + age_complication * 0.3)
        
        # Line item calculations
        # 1. Room & Nursing: Daily room rate * room multiplier * city * hospital * stay days
        daily_room_eff = proc_info["base_daily_room"] * room_mult * city_mult * hosp_mult
        room_and_nursing = round(daily_room_eff * stay_duration_days * np.random.uniform(0.95, 1.05), 2)
        
        # 2. Surgery & OT: Fixed cost * city * hospital * room multiplier (in India, room tier inflates OT charges)
        surgery_base = proc_info["base_surgery_ot"]
        surgery_and_ot = round(surgery_base * city_mult * hosp_mult * (1.0 + (room_mult - 1.0) * 0.5) * np.random.uniform(0.92, 1.08), 2) if surgery_base > 0 else 0.0
        
        # 3. Doctor Fees: Daily doctor fee * stay days * hospital * city * age complication
        daily_doc = proc_info["base_daily_doctor"] * (1.0 + age_complication) * city_mult * hosp_mult
        doctor_fees = round(daily_doc * stay_duration_days * np.random.uniform(0.92, 1.08), 2)
        
        # 4. Medicines & Implants
        med_base = proc_info["base_medicines_implants"] * (1.0 + age_complication * 0.8) * hosp_mult
        medicines_and_implants = round(med_base * np.random.uniform(0.90, 1.10), 2)
        
        # 5. Consumables
        cons_base = proc_info["base_consumables"] * (1.0 + stay_duration_days * 0.1) * hosp_mult * city_mult
        consumables = round(cons_base * np.random.uniform(0.90, 1.10), 2)
        
        # Apply global heteroscedastic noise to overall bill
        subtotal = room_and_nursing + surgery_and_ot + doctor_fees + medicines_and_implants + consumables
        total_bill = round(max(5000.0, subtotal * noise_factor), 2)
        
        records.append({
            "procedure_name": proc_name,
            "patient_age": patient_age,
            "city_tier": city_tier,
            "hospital_tier": hospital_tier,
            "room_category": room_category,
            "stay_duration_days": stay_duration_days,
            "room_and_nursing": room_and_nursing,
            "surgery_and_ot": surgery_and_ot,
            "doctor_fees": doctor_fees,
            "medicines_and_implants": medicines_and_implants,
            "consumables": consumables,
            "total_bill": total_bill,
        })
        
    df = pd.DataFrame(records)
    
    if output_path is None:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        output_path = os.path.join(base_dir, "hospital_tariffs.csv")
        
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Generated dataset with {len(df)} records at {output_path}")
    return df

if __name__ == "__main__":
    generate_dataset()
