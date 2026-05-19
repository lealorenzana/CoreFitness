import type { ChatbotResponse } from '../types';

export const CHATBOT_RESPONSES: ChatbotResponse[] = [
  {
    pattern: /gym hours|operating hours|anong oras|bukas|open/i,
    responses: {
      en: 'Our gym hours are Monday-Friday: 5:00 AM - 10:00 PM, Saturday-Sunday: 6:00 AM - 9:00 PM.',
      fil: 'Ang oras ng gym ay Lunes-Biyernes: 5:00 AM - 10:00 PM, Sabado-Linggo: 6:00 AM - 9:00 PM.'
    }
  },
  {
    pattern: /membership|fee|price|magkano|presyo|bayad/i,
    responses: {
      en: 'Our membership plans are: Basic ₱800/month, Standard ₱1,500/month, Premium ₱2,500/month.',
      fil: 'Ang aming membership plans ay: Basic ₱800/buwan, Standard ₱1,500/buwan, Premium ₱2,500/buwan.'
    }
  },
  {
    pattern: /location|address|nasaan|saan/i,
    responses: {
      en: 'We have three locations in Mamburao, Occidental Mindoro: G-Fitness (Poblacion), Fitness Regency (Barangay Payompon), and Ferrer Fitness (Barangay Tayamaan).',
      fil: 'Mayroon kaming tatlong lokasyon sa Mamburao, Occidental Mindoro: G-Fitness (Poblacion), Fitness Regency (Barangay Payompon), at Ferrer Fitness (Barangay Tayamaan).'
    }
  },
  {
    pattern: /trainer|coach|instructor/i,
    responses: {
      en: 'Our trainers specialize in Strength Training, HIIT, Yoga, Boxing, and CrossFit. Popular coaches include Coach Eman, Coach Trish, Coach Bong, and Coach Liza.',
      fil: 'Ang aming mga trainers ay dalubhasa sa Strength Training, HIIT, Yoga, Boxing, at CrossFit. Kasama sina Coach Eman, Coach Trish, Coach Bong, at Coach Liza.'
    }
  },
  {
    pattern: /class|schedule|klase|iskedyul/i,
    responses: {
      en: 'We offer morning classes (6-8 AM) and evening classes (5-7 PM). Classes include Strength Training, HIIT, Yoga, Boxing, and CrossFit.',
      fil: 'Nag-aalok kami ng umaga (6-8 AM) at gabi (5-7 PM) na klase. Kasama ang Strength Training, HIIT, Yoga, Boxing, at CrossFit.'
    }
  },
  {
    pattern: /facilities|equipment|kagamitan/i,
    responses: {
      en: 'Our facilities include cardio machines, free weights, resistance machines, boxing ring, yoga studio, and locker rooms with showers.',
      fil: 'Ang aming facilities ay may cardio machines, free weights, resistance machines, boxing ring, yoga studio, at locker rooms na may shower.'
    }
  },
  {
    pattern: /policy|rules|patakaran/i,
    responses: {
      en: 'Please bring your membership card or QR code for check-in. Proper gym attire required. Clean equipment after use. No outside food or drinks.',
      fil: 'Dalhin ang inyong membership card o QR code para sa check-in. Kailangan ng tamang gym attire. Linisin ang equipment pagkatapos gamitin. Bawal ang pagkain o inumin mula sa labas.'
    }
  },
  {
    pattern: /contact|phone|email|tawag/i,
    responses: {
      en: 'Contact us: G-Fitness (+63 917 123 4567), Fitness Regency (+63 917 234 5678), Ferrer Fitness (+63 917 345 6789).',
      fil: 'Makipag-ugnayan sa amin: G-Fitness (+63 917 123 4567), Fitness Regency (+63 917 234 5678), Ferrer Fitness (+63 917 345 6789).'
    }
  },
  {
    pattern: /hello|hi|kumusta|hey/i,
    responses: {
      en: 'Hello! Welcome to G-Fitness CORE. How can I help you today?',
      fil: 'Kumusta! Maligayang pagdating sa G-Fitness CORE. Paano kita matutulungan ngayong araw?'
    }
  },
  {
    pattern: /thank|salamat|thanks/i,
    responses: {
      en: 'You\'re welcome! Feel free to ask if you have more questions.',
      fil: 'Walang anuman! Magtanong lang kung may iba ka pang katanungan.'
    }
  }
];

export const FALLBACK_RESPONSE = {
  en: 'I\'m sorry, I didn\'t understand that. Could you please rephrase your question? You can ask about gym hours, membership fees, trainers, classes, or facilities.',
  fil: 'Paumanhin, hindi ko naintindihan iyon. Maaari mo bang ulitin ang iyong tanong? Maaari kang magtanong tungkol sa oras ng gym, bayad sa membership, trainers, klase, o facilities.'
};
