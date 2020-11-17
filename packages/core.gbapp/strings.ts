
export const Messages = {
  global_quit: /^(sair|sai|chega|exit|quit|finish|end|ausfahrt|verlassen)/i,
  'en-US': {
    show_video: 'I will show you a video, please wait...',
    good_morning: 'good morning',
    good_evening: 'good evening',
    good_night: 'good night',
    hi: (msg) => `Hello, ${msg}.`,
    very_sorry_about_error: `I'm sorry to inform that there was an error which was recorded to be solved.`,
    canceled: 'Canceled. If I can be useful, let me know how',
    whats_email: "What's your E-mail address?",
    which_language: "Which language would you like to choose from?",
    validation_enter_valid_email: "Please enter a valid e-mail."   ,
    affirmative_sentences: /^(sim|s|positivo|afirmativo|claro|evidente|sem dúvida|confirmo|confirmar|confirmado|uhum)/i,
    
  },
  'pt-BR': {
    show_video: 'Vou te mostrar um vídeo. Por favor, aguarde...',
    good_morning: 'bom dia',
    good_evening: 'boa tarde',
    good_night: 'boa noite',
    hi: (msg) => `Oi, ${msg}.`,
    very_sorry_about_error: `Lamento, ocorreu um erro que já foi registrado para ser tratado.`,
    canceled: 'Cancelado, avise como posso ser útil novamente.',
    whats_email: "Qual seu e-mail?",
    which_language: "Qual idioma você gostaria de usar?",
    validation_enter_valid_email: "Por favor digite um email válido.",
    affirmative_sentences: /^(sim|s|positivo|afirmativo|claro|evidente|sem dúvida|confirmo|confirmar|confirmado|uhum)/i,

  }
};
