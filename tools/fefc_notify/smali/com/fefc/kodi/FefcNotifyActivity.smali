.class public Lcom/fefc/kodi/FefcNotifyActivity;
.super Landroid/app/Activity;
.source "FefcNotifyActivity.java"


# static fields
.field private static final CH_ID:Ljava/lang/String; = "fefc"

.field private static final CH_NAME:Ljava/lang/String; = "FEFC"


# direct methods
.method public constructor <init>()V
    .registers 1

    .line 23
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V

    return-void
.end method

.method private ensurePerm()V
    .registers 3

    .line 74
    sget v0, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v1, 0x21

    if-ge v0, v1, :cond_7

    return-void

    .line 75
    :cond_7
    const-string v0, "android.permission.POST_NOTIFICATIONS"

    invoke-virtual {p0, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->checkSelfPermission(Ljava/lang/String;)I

    move-result v1

    if-nez v1, :cond_10

    .line 76
    return-void

    .line 77
    :cond_10
    filled-new-array {v0}, [Ljava/lang/String;

    move-result-object v0

    const/4 v1, 0x1

    invoke-virtual {p0, v0, v1}, Lcom/fefc/kodi/FefcNotifyActivity;->requestPermissions([Ljava/lang/String;I)V

    .line 78
    return-void
.end method

.method private handle(Landroid/content/Intent;)V
    .registers 7

    .line 49
    if-nez p1, :cond_3

    return-void

    .line 50
    :cond_3
    invoke-virtual {p1}, Landroid/content/Intent;->getData()Landroid/net/Uri;

    move-result-object p1

    .line 51
    if-nez p1, :cond_a

    return-void

    .line 52
    :cond_a
    invoke-virtual {p1}, Landroid/net/Uri;->getHost()Ljava/lang/String;

    move-result-object v0

    .line 53
    const-string v1, ""

    if-nez v0, :cond_13

    move-object v0, v1

    .line 54
    :cond_13
    const-string v2, "notify"

    invoke-virtual {v2, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v2

    const-string v3, "files"

    const-string v4, "kind"

    if-eqz v2, :cond_3e

    .line 55
    invoke-direct {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->ensurePerm()V

    .line 56
    invoke-static {p1, v4, v3}, Lcom/fefc/kodi/FefcNotifyActivity;->q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    .line 57
    const-string v2, "title"

    const-string v3, "FEFC"

    invoke-static {p1, v2, v3}, Lcom/fefc/kodi/FefcNotifyActivity;->q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v2

    .line 58
    const-string v3, "text"

    invoke-static {p1, v3, v1}, Lcom/fefc/kodi/FefcNotifyActivity;->q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v1

    .line 59
    const-string v3, "nid"

    invoke-static {p1, v3, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object p1

    .line 60
    invoke-direct {p0, v0, v2, v1, p1}, Lcom/fefc/kodi/FefcNotifyActivity;->post(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V

    goto :goto_51

    .line 61
    :cond_3e
    const-string v1, "open"

    invoke-virtual {v1, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_51

    .line 62
    invoke-static {p1, v4, v3}, Lcom/fefc/kodi/FefcNotifyActivity;->q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object p1

    .line 63
    invoke-direct {p0, p1}, Lcom/fefc/kodi/FefcNotifyActivity;->writePending(Ljava/lang/String;)V

    .line 64
    invoke-direct {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->launchMain()V

    goto :goto_52

    .line 61
    :cond_51
    :goto_51
    nop

    .line 66
    :goto_52
    return-void
.end method

.method private launchMain()V
    .registers 3

    .line 128
    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->getPackageManager()Landroid/content/pm/PackageManager;

    move-result-object v0

    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->getPackageName()Ljava/lang/String;

    move-result-object v1

    invoke-virtual {v0, v1}, Landroid/content/pm/PackageManager;->getLaunchIntentForPackage(Ljava/lang/String;)Landroid/content/Intent;

    move-result-object v0

    .line 129
    if-nez v0, :cond_21

    .line 130
    new-instance v0, Landroid/content/Intent;

    const-string v1, "android.intent.action.MAIN"

    invoke-direct {v0, v1}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V

    .line 131
    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->getPackageName()Ljava/lang/String;

    move-result-object v1

    invoke-virtual {v0, v1}, Landroid/content/Intent;->setPackage(Ljava/lang/String;)Landroid/content/Intent;

    .line 132
    const-string v1, "android.intent.category.LAUNCHER"

    invoke-virtual {v0, v1}, Landroid/content/Intent;->addCategory(Ljava/lang/String;)Landroid/content/Intent;

    .line 134
    :cond_21
    const/high16 v1, 0x10200000

    invoke-virtual {v0, v1}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;

    .line 135
    invoke-virtual {p0, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->startActivity(Landroid/content/Intent;)V

    .line 136
    return-void
.end method

.method private post(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V
    .registers 11

    .line 81
    const-string v0, "notification"

    invoke-virtual {p0, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v0

    check-cast v0, Landroid/app/NotificationManager;

    .line 82
    if-nez v0, :cond_b

    return-void

    .line 83
    :cond_b
    sget v1, Landroid/os/Build$VERSION;->SDK_INT:I

    const-string v2, "fefc"

    const/16 v3, 0x1a

    if-lt v1, v3, :cond_23

    .line 84
    new-instance v1, Landroid/app/NotificationChannel;

    const-string v4, "FEFC"

    const/4 v5, 0x3

    invoke-direct {v1, v2, v4, v5}, Landroid/app/NotificationChannel;-><init>(Ljava/lang/String;Ljava/lang/CharSequence;I)V

    .line 85
    const-string v4, "Fan Edit Fan Club Collection"

    invoke-virtual {v1, v4}, Landroid/app/NotificationChannel;->setDescription(Ljava/lang/String;)V

    .line 86
    invoke-virtual {v0, v1}, Landroid/app/NotificationManager;->createNotificationChannel(Landroid/app/NotificationChannel;)V

    .line 88
    :cond_23
    new-instance v1, Landroid/content/Intent;

    const-class v4, Lcom/fefc/kodi/FefcNotifyActivity;

    invoke-direct {v1, p0, v4}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    .line 89
    new-instance v4, Ljava/lang/StringBuilder;

    invoke-direct {v4}, Ljava/lang/StringBuilder;-><init>()V

    const-string v5, "fefcnotify://open?kind="

    invoke-virtual {v4, v5}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object v4

    invoke-static {p1}, Landroid/net/Uri;->encode(Ljava/lang/String;)Ljava/lang/String;

    move-result-object p1

    invoke-virtual {v4, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object p1

    invoke-virtual {p1}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object p1

    invoke-static {p1}, Landroid/net/Uri;->parse(Ljava/lang/String;)Landroid/net/Uri;

    move-result-object p1

    invoke-virtual {v1, p1}, Landroid/content/Intent;->setData(Landroid/net/Uri;)Landroid/content/Intent;

    .line 90
    const/high16 p1, 0x14000000

    invoke-virtual {v1, p1}, Landroid/content/Intent;->setFlags(I)Landroid/content/Intent;

    .line 91
    nop

    .line 92
    sget p1, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v4, 0x17

    if-lt p1, v4, :cond_57

    const/high16 p1, 0xc000000

    goto :goto_59

    :cond_57
    const/high16 p1, 0x8000000

    .line 93
    :goto_59
    invoke-virtual {p4}, Ljava/lang/String;->hashCode()I

    move-result p4

    .line 94
    invoke-static {p0, p4, v1, p1}, Landroid/app/PendingIntent;->getActivity(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;

    move-result-object p1

    .line 97
    sget v1, Landroid/os/Build$VERSION;->SDK_INT:I

    if-lt v1, v3, :cond_6b

    .line 98
    new-instance v1, Landroid/app/Notification$Builder;

    invoke-direct {v1, p0, v2}, Landroid/app/Notification$Builder;-><init>(Landroid/content/Context;Ljava/lang/String;)V

    goto :goto_70

    .line 100
    :cond_6b
    new-instance v1, Landroid/app/Notification$Builder;

    invoke-direct {v1, p0}, Landroid/app/Notification$Builder;-><init>(Landroid/content/Context;)V

    .line 102
    :goto_70
    invoke-virtual {v1, p2}, Landroid/app/Notification$Builder;->setContentTitle(Ljava/lang/CharSequence;)Landroid/app/Notification$Builder;

    move-result-object p2

    .line 103
    invoke-virtual {p2, p3}, Landroid/app/Notification$Builder;->setContentText(Ljava/lang/CharSequence;)Landroid/app/Notification$Builder;

    move-result-object p2

    new-instance v2, Landroid/app/Notification$BigTextStyle;

    invoke-direct {v2}, Landroid/app/Notification$BigTextStyle;-><init>()V

    .line 104
    invoke-virtual {v2, p3}, Landroid/app/Notification$BigTextStyle;->bigText(Ljava/lang/CharSequence;)Landroid/app/Notification$BigTextStyle;

    move-result-object p3

    invoke-virtual {p2, p3}, Landroid/app/Notification$Builder;->setStyle(Landroid/app/Notification$Style;)Landroid/app/Notification$Builder;

    move-result-object p2

    .line 105
    const p3, 0x108009b

    invoke-virtual {p2, p3}, Landroid/app/Notification$Builder;->setSmallIcon(I)Landroid/app/Notification$Builder;

    move-result-object p2

    .line 106
    const/4 p3, 0x1

    invoke-virtual {p2, p3}, Landroid/app/Notification$Builder;->setAutoCancel(Z)Landroid/app/Notification$Builder;

    move-result-object p2

    .line 107
    invoke-virtual {p2, p1}, Landroid/app/Notification$Builder;->setContentIntent(Landroid/app/PendingIntent;)Landroid/app/Notification$Builder;

    .line 108
    sget p1, Landroid/os/Build$VERSION;->SDK_INT:I

    if-ge p1, v3, :cond_9c

    .line 109
    const/4 p1, 0x0

    invoke-virtual {v1, p1}, Landroid/app/Notification$Builder;->setPriority(I)Landroid/app/Notification$Builder;

    .line 111
    :cond_9c
    invoke-virtual {v1}, Landroid/app/Notification$Builder;->build()Landroid/app/Notification;

    move-result-object p1

    invoke-virtual {v0, p4, p1}, Landroid/app/NotificationManager;->notify(ILandroid/app/Notification;)V

    .line 112
    return-void
.end method

.method private static q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;
    .registers 3

    .line 69
    invoke-virtual {p0, p1}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;

    move-result-object p0

    .line 70
    if-eqz p0, :cond_e

    invoke-virtual {p0}, Ljava/lang/String;->length()I

    move-result p1

    if-nez p1, :cond_d

    goto :goto_e

    :cond_d
    move-object p2, p0

    :cond_e
    :goto_e
    return-object p2
.end method

.method private writePending(Ljava/lang/String;)V
    .registers 5

    .line 115
    const/4 v0, 0x0

    invoke-virtual {p0, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->getExternalFilesDir(Ljava/lang/String;)Ljava/io/File;

    move-result-object v0

    .line 116
    if-nez v0, :cond_b

    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->getFilesDir()Ljava/io/File;

    move-result-object v0

    .line 117
    :cond_b
    if-nez v0, :cond_e

    return-void

    .line 118
    :cond_e
    new-instance v1, Ljava/io/File;

    const-string v2, "fefc-pending-nav.txt"

    invoke-direct {v1, v0, v2}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V

    .line 120
    :try_start_15
    new-instance v0, Ljava/io/FileOutputStream;

    invoke-direct {v0, v1}, Ljava/io/FileOutputStream;-><init>(Ljava/io/File;)V

    .line 121
    sget-object v1, Ljava/nio/charset/StandardCharsets;->UTF_8:Ljava/nio/charset/Charset;

    invoke-virtual {p1, v1}, Ljava/lang/String;->getBytes(Ljava/nio/charset/Charset;)[B

    move-result-object p1

    invoke-virtual {v0, p1}, Ljava/io/FileOutputStream;->write([B)V

    .line 122
    invoke-virtual {v0}, Ljava/io/FileOutputStream;->close()V
    :try_end_26
    .catch Ljava/lang/Exception; {:try_start_15 .. :try_end_26} :catch_27

    .line 124
    goto :goto_28

    .line 123
    :catch_27
    move-exception p1

    .line 125
    :goto_28
    return-void
.end method


# virtual methods
.method protected onCreate(Landroid/os/Bundle;)V
    .registers 2

    .line 29
    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    .line 31
    :try_start_3
    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->getIntent()Landroid/content/Intent;

    move-result-object p1

    invoke-direct {p0, p1}, Lcom/fefc/kodi/FefcNotifyActivity;->handle(Landroid/content/Intent;)V
    :try_end_a
    .catchall {:try_start_3 .. :try_end_a} :catchall_b

    .line 34
    goto :goto_c

    .line 32
    :catchall_b
    move-exception p1

    .line 35
    :goto_c
    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->finish()V

    .line 36
    return-void
.end method

.method protected onNewIntent(Landroid/content/Intent;)V
    .registers 2

    .line 40
    invoke-super {p0, p1}, Landroid/app/Activity;->onNewIntent(Landroid/content/Intent;)V

    .line 42
    :try_start_3
    invoke-direct {p0, p1}, Lcom/fefc/kodi/FefcNotifyActivity;->handle(Landroid/content/Intent;)V
    :try_end_6
    .catchall {:try_start_3 .. :try_end_6} :catchall_7

    .line 44
    goto :goto_8

    .line 43
    :catchall_7
    move-exception p1

    .line 45
    :goto_8
    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->finish()V

    .line 46
    return-void
.end method
