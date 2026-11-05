.class public Lcom/fefc/kodi/FefcInputActivity;
.super Landroid/app/Activity;
.source "FefcInputActivity.java"


# instance fields
.field private done:Z

.field private tok:Ljava/lang/String;


# direct methods
.method public constructor <init>()V
    .registers 2

    .line 24
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V

    .line 25
    const-string v0, "x"

    iput-object v0, p0, Lcom/fefc/kodi/FefcInputActivity;->tok:Ljava/lang/String;

    .line 26
    const/4 v0, 0x0

    iput-boolean v0, p0, Lcom/fefc/kodi/FefcInputActivity;->done:Z

    return-void
.end method

.method static synthetic access$000(Lcom/fefc/kodi/FefcInputActivity;Ljava/lang/String;)V
    .registers 2

    .line 24
    invoke-direct {p0, p1}, Lcom/fefc/kodi/FefcInputActivity;->finishWith(Ljava/lang/String;)V

    return-void
.end method

.method private finishWith(Ljava/lang/String;)V
    .registers 3

    .line 94
    iget-boolean v0, p0, Lcom/fefc/kodi/FefcInputActivity;->done:Z

    if-eqz v0, :cond_5

    return-void

    .line 95
    :cond_5
    const/4 v0, 0x1

    iput-boolean v0, p0, Lcom/fefc/kodi/FefcInputActivity;->done:Z

    .line 96
    const-string v0, "txt"

    invoke-direct {p0, v0, p1}, Lcom/fefc/kodi/FefcInputActivity;->write(Ljava/lang/String;Ljava/lang/String;)V

    .line 97
    invoke-virtual {p0}, Lcom/fefc/kodi/FefcInputActivity;->finish()V

    .line 98
    return-void
.end method

.method private write(Ljava/lang/String;Ljava/lang/String;)V
    .registers 9

    .line 80
    const-string v0, "."

    const-string v1, "fefc-input-"

    const/4 v2, 0x0

    invoke-virtual {p0, v2}, Lcom/fefc/kodi/FefcInputActivity;->getExternalFilesDir(Ljava/lang/String;)Ljava/io/File;

    move-result-object v2

    .line 81
    if-nez v2, :cond_f

    invoke-virtual {p0}, Lcom/fefc/kodi/FefcInputActivity;->getFilesDir()Ljava/io/File;

    move-result-object v2

    .line 82
    :cond_f
    if-nez v2, :cond_12

    return-void

    .line 84
    :cond_12
    :try_start_12
    new-instance v3, Ljava/io/File;

    new-instance v4, Ljava/lang/StringBuilder;

    invoke-direct {v4}, Ljava/lang/StringBuilder;-><init>()V

    invoke-virtual {v4, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v4

    iget-object v5, p0, Lcom/fefc/kodi/FefcInputActivity;->tok:Ljava/lang/String;

    invoke-virtual {v4, v5}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v4

    invoke-virtual {v4, v0}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v4

    invoke-virtual {v4, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v4

    const-string v5, ".tmp"

    invoke-virtual {v4, v5}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v4

    invoke-virtual {v4}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v4

    invoke-direct {v3, v2, v4}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V

    .line 85
    new-instance v4, Ljava/io/FileOutputStream;

    invoke-direct {v4, v3}, Ljava/io/FileOutputStream;-><init>(Ljava/io/File;)V

    .line 86
    sget-object v5, Ljava/nio/charset/StandardCharsets;->UTF_8:Ljava/nio/charset/Charset;

    invoke-virtual {p2, v5}, Ljava/lang/String;->getBytes(Ljava/nio/charset/Charset;)[B

    move-result-object p2

    invoke-virtual {v4, p2}, Ljava/io/FileOutputStream;->write([B)V

    .line 87
    invoke-virtual {v4}, Ljava/io/FileOutputStream;->close()V

    .line 88
    new-instance p2, Ljava/io/File;

    new-instance v4, Ljava/lang/StringBuilder;

    invoke-direct {v4}, Ljava/lang/StringBuilder;-><init>()V

    invoke-virtual {v4, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v1

    iget-object v4, p0, Lcom/fefc/kodi/FefcInputActivity;->tok:Ljava/lang/String;

    invoke-virtual {v1, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v1

    invoke-virtual {v1, v0}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v0

    invoke-virtual {v0, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object p1

    invoke-virtual {p1}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object p1

    invoke-direct {p2, v2, p1}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V

    invoke-virtual {v3, p2}, Ljava/io/File;->renameTo(Ljava/io/File;)Z
    :try_end_6c
    .catch Ljava/lang/Exception; {:try_start_12 .. :try_end_6c} :catch_6d

    .line 90
    goto :goto_6e

    .line 89
    :catch_6d
    move-exception p1

    .line 91
    :goto_6e
    return-void
.end method


# virtual methods
.method protected onCreate(Landroid/os/Bundle;)V
    .registers 7

    .line 30
    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    .line 31
    invoke-virtual {p0}, Lcom/fefc/kodi/FefcInputActivity;->getIntent()Landroid/content/Intent;

    move-result-object p1

    if-eqz p1, :cond_12

    invoke-virtual {p0}, Lcom/fefc/kodi/FefcInputActivity;->getIntent()Landroid/content/Intent;

    move-result-object p1

    invoke-virtual {p1}, Landroid/content/Intent;->getData()Landroid/net/Uri;

    move-result-object p1

    goto :goto_13

    :cond_12
    const/4 p1, 0x0

    .line 32
    :goto_13
    nop

    .line 33
    nop

    .line 34
    const-string v0, "1"

    const-string v1, ""

    const-string v2, "Search"

    if-eqz p1, :cond_4a

    .line 35
    const-string v3, "tok"

    invoke-virtual {p1, v3}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v3

    if-eqz v3, :cond_2d

    const-string v4, "[^A-Za-z0-9]"

    invoke-virtual {v3, v4, v1}, Ljava/lang/String;->replaceAll(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v3

    iput-object v3, p0, Lcom/fefc/kodi/FefcInputActivity;->tok:Ljava/lang/String;

    .line 36
    :cond_2d
    const-string v3, "h"

    invoke-virtual {p1, v3}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v3

    if-eqz v3, :cond_36

    move-object v2, v3

    .line 37
    :cond_36
    const-string v3, "d"

    invoke-virtual {p1, v3}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v3

    if-eqz v3, :cond_3f

    move-object v1, v3

    .line 38
    :cond_3f
    const-string v3, "num"

    invoke-virtual {p1, v3}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;

    move-result-object p1

    invoke-virtual {v0, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result p1

    goto :goto_4b

    .line 34
    :cond_4a
    const/4 p1, 0x0

    .line 40
    :goto_4b
    const-string v3, "ack"

    invoke-direct {p0, v3, v0}, Lcom/fefc/kodi/FefcInputActivity;->write(Ljava/lang/String;Ljava/lang/String;)V

    .line 41
    new-instance v0, Landroid/widget/EditText;

    invoke-direct {v0, p0}, Landroid/widget/EditText;-><init>(Landroid/content/Context;)V

    .line 42
    const/4 v3, 0x1

    invoke-virtual {v0, v3}, Landroid/widget/EditText;->setSingleLine(Z)V

    .line 43
    invoke-virtual {v0, v1}, Landroid/widget/EditText;->setText(Ljava/lang/CharSequence;)V

    .line 44
    invoke-virtual {v1}, Ljava/lang/String;->length()I

    move-result v1

    invoke-virtual {v0, v1}, Landroid/widget/EditText;->setSelection(I)V

    .line 45
    const v1, 0x10000002

    invoke-virtual {v0, v1}, Landroid/widget/EditText;->setImeOptions(I)V

    .line 46
    if-eqz p1, :cond_6d

    const/4 p1, 0x2

    goto :goto_70

    :cond_6d
    const p1, 0x80001

    :goto_70
    invoke-virtual {v0, p1}, Landroid/widget/EditText;->setInputType(I)V

    .line 47
    new-instance p1, Lcom/fefc/kodi/FefcInputActivity$1;

    invoke-direct {p1, p0, v0}, Lcom/fefc/kodi/FefcInputActivity$1;-><init>(Lcom/fefc/kodi/FefcInputActivity;Landroid/widget/EditText;)V

    invoke-virtual {v0, p1}, Landroid/widget/EditText;->setOnEditorActionListener(Landroid/widget/TextView$OnEditorActionListener;)V

    .line 57
    new-instance p1, Landroid/app/AlertDialog$Builder;

    const v1, 0x10302d1

    invoke-direct {p1, p0, v1}, Landroid/app/AlertDialog$Builder;-><init>(Landroid/content/Context;I)V

    .line 58
    invoke-virtual {p1, v2}, Landroid/app/AlertDialog$Builder;->setTitle(Ljava/lang/CharSequence;)Landroid/app/AlertDialog$Builder;

    move-result-object p1

    invoke-virtual {p1, v0}, Landroid/app/AlertDialog$Builder;->setView(Landroid/view/View;)Landroid/app/AlertDialog$Builder;

    move-result-object p1

    new-instance v1, Lcom/fefc/kodi/FefcInputActivity$4;

    invoke-direct {v1, p0, v0}, Lcom/fefc/kodi/FefcInputActivity$4;-><init>(Lcom/fefc/kodi/FefcInputActivity;Landroid/widget/EditText;)V

    .line 59
    const-string v2, "OK"

    invoke-virtual {p1, v2, v1}, Landroid/app/AlertDialog$Builder;->setPositiveButton(Ljava/lang/CharSequence;Landroid/content/DialogInterface$OnClickListener;)Landroid/app/AlertDialog$Builder;

    move-result-object p1

    new-instance v1, Lcom/fefc/kodi/FefcInputActivity$3;

    invoke-direct {v1, p0}, Lcom/fefc/kodi/FefcInputActivity$3;-><init>(Lcom/fefc/kodi/FefcInputActivity;)V

    .line 62
    const-string v2, "Cancel"

    invoke-virtual {p1, v2, v1}, Landroid/app/AlertDialog$Builder;->setNegativeButton(Ljava/lang/CharSequence;Landroid/content/DialogInterface$OnClickListener;)Landroid/app/AlertDialog$Builder;

    move-result-object p1

    new-instance v1, Lcom/fefc/kodi/FefcInputActivity$2;

    invoke-direct {v1, p0}, Lcom/fefc/kodi/FefcInputActivity$2;-><init>(Lcom/fefc/kodi/FefcInputActivity;)V

    .line 65
    invoke-virtual {p1, v1}, Landroid/app/AlertDialog$Builder;->setOnCancelListener(Landroid/content/DialogInterface$OnCancelListener;)Landroid/app/AlertDialog$Builder;

    move-result-object p1

    .line 67
    invoke-virtual {p1}, Landroid/app/AlertDialog$Builder;->create()Landroid/app/AlertDialog;

    move-result-object p1

    .line 68
    invoke-virtual {p1}, Landroid/app/AlertDialog;->getWindow()Landroid/view/Window;

    move-result-object v1

    const/4 v2, 0x5

    invoke-virtual {v1, v2}, Landroid/view/Window;->setSoftInputMode(I)V

    .line 69
    invoke-virtual {p1}, Landroid/app/AlertDialog;->show()V

    .line 70
    invoke-virtual {v0}, Landroid/widget/EditText;->requestFocus()Z

    .line 71
    new-instance p1, Lcom/fefc/kodi/FefcInputActivity$5;

    invoke-direct {p1, p0, v0}, Lcom/fefc/kodi/FefcInputActivity$5;-><init>(Lcom/fefc/kodi/FefcInputActivity;Landroid/widget/EditText;)V

    const-wide/16 v1, 0x96

    invoke-virtual {v0, p1, v1, v2}, Landroid/widget/EditText;->postDelayed(Ljava/lang/Runnable;J)Z

    .line 77
    return-void
.end method

.method protected onDestroy()V
    .registers 2

    .line 102
    const-string v0, "CANCEL"

    invoke-direct {p0, v0}, Lcom/fefc/kodi/FefcInputActivity;->finishWith(Ljava/lang/String;)V

    .line 103
    invoke-super {p0}, Landroid/app/Activity;->onDestroy()V

    .line 104
    return-void
.end method
