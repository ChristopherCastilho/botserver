REM SET SCHEDULE "* 8 * * * *"

user = "user@domain.com"
pass = "*************"
o = get "https://oooooooooo"

# Criar a legenda para o post
caption = REWRITE "Crie um post sobre produtos, no estilo dica do dia, incluindo 10 hashtags, estilo Instagram o texto! Importante, retorne só a saída de texto pronta"

# Obter uma imagem relacionada ao conteúdo
image = GET IMAGE caption

# Postar no Instagram
POST TO INSTAGRAM username, password, image, caption

# Postar no Facebook
POST TO FACEBOOK username, password, image, caption

# Postar no BlueSky
BLUESKY username, password, image, caption
