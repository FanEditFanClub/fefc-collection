.class public Lcom/fefc/kodi/FefcNotifyActivity;
.super Landroid/app/Activity;
.source "FefcNotifyActivity.java"


# static fields
.field private static final CH_ID:Ljava/lang/String; = "fefc"

.field private static final CH_NAME:Ljava/lang/String; = "FEFC"


# instance fields
.field private pendingKind:Ljava/lang/String;

.field private pendingNid:Ljava/lang/String;

.field private pendingText:Ljava/lang/String;

.field private pendingTitle:Ljava/lang/String;

.field private waitingPerm:Z


# direct methods
.method public constructor <init>()V
    .registers 1

    .line 24
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V

    return-void
.end method

.method private ensurePerm(Z)Z
    .registers 4

    .line 104
    sget p1, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v0, 0x21

    const/4 v1, 0x0

    if-ge p1, v0, :cond_8

    return v1

    .line 105
    :cond_8
    const-string p1, "android.permission.POST_NOTIFICATIONS"

    invoke-virtual {p0, p1}, Lcom/fefc/kodi/FefcNotifyActivity;->checkSelfPermission(Ljava/lang/String;)I

    move-result v0

    if-nez v0, :cond_11

    .line 106
    return v1

    .line 107
    :cond_11
    const/4 v0, 0x1

    iput-boolean v0, p0, Lcom/fefc/kodi/FefcNotifyActivity;->waitingPerm:Z

    .line 108
    filled-new-array {p1}, [Ljava/lang/String;

    move-result-object p1

    invoke-virtual {p0, p1, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->requestPermissions([Ljava/lang/String;I)V

    .line 109
    return v0
.end method

.method private handle(Landroid/content/Intent;)V
    .registers 7

    .line 68
    if-nez p1, :cond_3

    return-void

    .line 69
    :cond_3
    invoke-virtual {p1}, Landroid/content/Intent;->getData()Landroid/net/Uri;

    move-result-object p1

    .line 70
    if-nez p1, :cond_a

    return-void

    .line 71
    :cond_a
    invoke-virtual {p1}, Landroid/net/Uri;->getHost()Ljava/lang/String;

    move-result-object v0

    .line 72
    const-string v1, ""

    if-nez v0, :cond_13

    move-object v0, v1

    .line 73
    :cond_13
    const-string v2, "perm"

    invoke-virtual {v2, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v2

    if-eqz v2, :cond_20

    .line 74
    const/4 p1, 0x1

    invoke-direct {p0, p1}, Lcom/fefc/kodi/FefcNotifyActivity;->ensurePerm(Z)Z

    .line 75
    return-void

    .line 77
    :cond_20
    const-string v2, "notify"

    invoke-virtual {v2, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v2

    const-string v3, "files"

    const-string v4, "kind"

    if-eqz v2, :cond_58

    .line 78
    invoke-static {p1, v4, v3}, Lcom/fefc/kodi/FefcNotifyActivity;->q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    .line 79
    const-string v2, "title"

    const-string v3, "FEFC"

    invoke-static {p1, v2, v3}, Lcom/fefc/kodi/FefcNotifyActivity;->q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v2

    .line 80
    const-string v3, "text"

    invoke-static {p1, v3, v1}, Lcom/fefc/kodi/FefcNotifyActivity;->q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v1

    .line 81
    const-string v3, "nid"

    invoke-static {p1, v3, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object p1

    .line 82
    const/4 v3, 0x0

    invoke-direct {p0, v3}, Lcom/fefc/kodi/FefcNotifyActivity;->ensurePerm(Z)Z

    move-result v3

    if-eqz v3, :cond_54

    .line 83
    iput-object v0, p0, Lcom/fefc/kodi/FefcNotifyActivity;->pendingKind:Ljava/lang/String;

    .line 84
    iput-object v2, p0, Lcom/fefc/kodi/FefcNotifyActivity;->pendingTitle:Ljava/lang/String;

    .line 85
    iput-object v1, p0, Lcom/fefc/kodi/FefcNotifyActivity;->pendingText:Ljava/lang/String;

    .line 86
    iput-object p1, p0, Lcom/fefc/kodi/FefcNotifyActivity;->pendingNid:Ljava/lang/String;

    .line 87
    return-void

    .line 89
    :cond_54
    invoke-direct {p0, v0, v2, v1, p1}, Lcom/fefc/kodi/FefcNotifyActivity;->post(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V

    goto :goto_6b

    .line 90
    :cond_58
    const-string v1, "open"

    invoke-virtual {v1, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_6b

    .line 91
    invoke-static {p1, v4, v3}, Lcom/fefc/kodi/FefcNotifyActivity;->q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object p1

    .line 92
    invoke-direct {p0, p1}, Lcom/fefc/kodi/FefcNotifyActivity;->writePending(Ljava/lang/String;)V

    .line 93
    invoke-direct {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->launchMain()V

    goto :goto_6c

    .line 90
    :cond_6b
    :goto_6b
    nop

    .line 95
    :goto_6c
    return-void
.end method

.method private launchMain()V
    .registers 3

    .line 160
    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->getPackageManager()Landroid/content/pm/PackageManager;

    move-result-object v0

    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->getPackageName()Ljava/lang/String;

    move-result-object v1

    invoke-virtual {v0, v1}, Landroid/content/pm/PackageManager;->getLaunchIntentForPackage(Ljava/lang/String;)Landroid/content/Intent;

    move-result-object v0

    .line 161
    if-nez v0, :cond_21

    .line 162
    new-instance v0, Landroid/content/Intent;

    const-string v1, "android.intent.action.MAIN"

    invoke-direct {v0, v1}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V

    .line 163
    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->getPackageName()Ljava/lang/String;

    move-result-object v1

    invoke-virtual {v0, v1}, Landroid/content/Intent;->setPackage(Ljava/lang/String;)Landroid/content/Intent;

    .line 164
    const-string v1, "android.intent.category.LAUNCHER"

    invoke-virtual {v0, v1}, Landroid/content/Intent;->addCategory(Ljava/lang/String;)Landroid/content/Intent;

    .line 166
    :cond_21
    const/high16 v1, 0x10200000

    invoke-virtual {v0, v1}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;

    .line 167
    invoke-virtual {p0, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->startActivity(Landroid/content/Intent;)V

    .line 168
    return-void
.end method

.method private post(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V
    .registers 11

    .line 113
    const-string v0, "notification"

    invoke-virtual {p0, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v0

    check-cast v0, Landroid/app/NotificationManager;

    .line 114
    if-nez v0, :cond_b

    return-void

    .line 115
    :cond_b
    sget v1, Landroid/os/Build$VERSION;->SDK_INT:I

    const-string v2, "fefc"

    const/16 v3, 0x1a

    if-lt v1, v3, :cond_23

    .line 116
    new-instance v1, Landroid/app/NotificationChannel;

    const-string v4, "FEFC"

    const/4 v5, 0x3

    invoke-direct {v1, v2, v4, v5}, Landroid/app/NotificationChannel;-><init>(Ljava/lang/String;Ljava/lang/CharSequence;I)V

    .line 117
    const-string v4, "Fan Edit Fan Club Collection"

    invoke-virtual {v1, v4}, Landroid/app/NotificationChannel;->setDescription(Ljava/lang/String;)V

    .line 118
    invoke-virtual {v0, v1}, Landroid/app/NotificationManager;->createNotificationChannel(Landroid/app/NotificationChannel;)V

    .line 120
    :cond_23
    new-instance v1, Landroid/content/Intent;

    const-class v4, Lcom/fefc/kodi/FefcNotifyActivity;

    invoke-direct {v1, p0, v4}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    .line 121
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

    .line 122
    const/high16 p1, 0x14000000

    invoke-virtual {v1, p1}, Landroid/content/Intent;->setFlags(I)Landroid/content/Intent;

    .line 123
    nop

    .line 124
    sget p1, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v4, 0x17

    if-lt p1, v4, :cond_57

    const/high16 p1, 0xc000000

    goto :goto_59

    :cond_57
    const/high16 p1, 0x8000000

    .line 125
    :goto_59
    invoke-virtual {p4}, Ljava/lang/String;->hashCode()I

    move-result p4

    .line 126
    invoke-static {p0, p4, v1, p1}, Landroid/app/PendingIntent;->getActivity(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;

    move-result-object p1

    .line 129
    sget v1, Landroid/os/Build$VERSION;->SDK_INT:I

    if-lt v1, v3, :cond_6b

    .line 130
    new-instance v1, Landroid/app/Notification$Builder;

    invoke-direct {v1, p0, v2}, Landroid/app/Notification$Builder;-><init>(Landroid/content/Context;Ljava/lang/String;)V

    goto :goto_70

    .line 132
    :cond_6b
    new-instance v1, Landroid/app/Notification$Builder;

    invoke-direct {v1, p0}, Landroid/app/Notification$Builder;-><init>(Landroid/content/Context;)V

    .line 134
    :goto_70
    invoke-virtual {v1, p2}, Landroid/app/Notification$Builder;->setContentTitle(Ljava/lang/CharSequence;)Landroid/app/Notification$Builder;

    move-result-object p2

    .line 135
    invoke-virtual {p2, p3}, Landroid/app/Notification$Builder;->setContentText(Ljava/lang/CharSequence;)Landroid/app/Notification$Builder;

    move-result-object p2

    new-instance v2, Landroid/app/Notification$BigTextStyle;

    invoke-direct {v2}, Landroid/app/Notification$BigTextStyle;-><init>()V

    .line 136
    invoke-virtual {v2, p3}, Landroid/app/Notification$BigTextStyle;->bigText(Ljava/lang/CharSequence;)Landroid/app/Notification$BigTextStyle;

    move-result-object p3

    invoke-virtual {p2, p3}, Landroid/app/Notification$Builder;->setStyle(Landroid/app/Notification$Style;)Landroid/app/Notification$Builder;

    move-result-object p2

    .line 137
    const p3, 0x108009b

    invoke-virtual {p2, p3}, Landroid/app/Notification$Builder;->setSmallIcon(I)Landroid/app/Notification$Builder;

    move-result-object p2

    .line 138
    const/4 p3, 0x1

    invoke-virtual {p2, p3}, Landroid/app/Notification$Builder;->setAutoCancel(Z)Landroid/app/Notification$Builder;

    move-result-object p2

    .line 139
    invoke-virtual {p2, p1}, Landroid/app/Notification$Builder;->setContentIntent(Landroid/app/PendingIntent;)Landroid/app/Notification$Builder;

    .line 140
    sget p1, Landroid/os/Build$VERSION;->SDK_INT:I

    if-ge p1, v3, :cond_9c

    .line 141
    const/4 p1, 0x0

    invoke-virtual {v1, p1}, Landroid/app/Notification$Builder;->setPriority(I)Landroid/app/Notification$Builder;

    .line 143
    :cond_9c
    invoke-virtual {v1}, Landroid/app/Notification$Builder;->build()Landroid/app/Notification;

    move-result-object p1

    invoke-virtual {v0, p4, p1}, Landroid/app/NotificationManager;->notify(ILandroid/app/Notification;)V

    .line 144
    return-void
.end method

.method private static q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;
    .registers 3

    .line 98
    invoke-virtual {p0, p1}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;

    move-result-object p0

    .line 99
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

    .line 147
    const/4 v0, 0x0

    invoke-virtual {p0, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->getExternalFilesDir(Ljava/lang/String;)Ljava/io/File;

    move-result-object v0

    .line 148
    if-nez v0, :cond_b

    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->getFilesDir()Ljava/io/File;

    move-result-object v0

    .line 149
    :cond_b
    if-nez v0, :cond_e

    return-void

    .line 150
    :cond_e
    new-instance v1, Ljava/io/File;

    const-string v2, "fefc-pending-nav.txt"

    invoke-direct {v1, v0, v2}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V

    .line 152
    :try_start_15
    new-instance v0, Ljava/io/FileOutputStream;

    invoke-direct {v0, v1}, Ljava/io/FileOutputStream;-><init>(Ljava/io/File;)V

    .line 153
    sget-object v1, Ljava/nio/charset/StandardCharsets;->UTF_8:Ljava/nio/charset/Charset;

    invoke-virtual {p1, v1}, Ljava/lang/String;->getBytes(Ljava/nio/charset/Charset;)[B

    move-result-object p1

    invoke-virtual {v0, p1}, Ljava/io/FileOutputStream;->write([B)V

    .line 154
    invoke-virtual {v0}, Ljava/io/FileOutputStream;->close()V
    :try_end_26
    .catch Ljava/lang/Exception; {:try_start_15 .. :try_end_26} :catch_27

    .line 156
    goto :goto_28

    .line 155
    :catch_27
    move-exception p1

    .line 157
    :goto_28
    return-void
.end method


# virtual methods
.method protected onCreate(Landroid/os/Bundle;)V
    .registers 2

    .line 35
    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    .line 37
    :try_start_3
    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->getIntent()Landroid/content/Intent;

    move-result-object p1

    invoke-direct {p0, p1}, Lcom/fefc/kodi/FefcNotifyActivity;->handle(Landroid/content/Intent;)V
    :try_end_a
    .catchall {:try_start_3 .. :try_end_a} :catchall_b

    .line 40
    goto :goto_c

    .line 38
    :catchall_b
    move-exception p1

    .line 41
    :goto_c
    iget-boolean p1, p0, Lcom/fefc/kodi/FefcNotifyActivity;->waitingPerm:Z

    if-nez p1, :cond_13

    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->finish()V

    .line 42
    :cond_13
    return-void
.end method

.method protected onNewIntent(Landroid/content/Intent;)V
    .registers 3

    .line 46
    invoke-super {p0, p1}, Landroid/app/Activity;->onNewIntent(Landroid/content/Intent;)V

    .line 47
    const/4 v0, 0x0

    iput-boolean v0, p0, Lcom/fefc/kodi/FefcNotifyActivity;->waitingPerm:Z

    .line 49
    :try_start_6
    invoke-direct {p0, p1}, Lcom/fefc/kodi/FefcNotifyActivity;->handle(Landroid/content/Intent;)V
    :try_end_9
    .catchall {:try_start_6 .. :try_end_9} :catchall_a

    .line 51
    goto :goto_b

    .line 50
    :catchall_a
    move-exception p1

    .line 52
    :goto_b
    iget-boolean p1, p0, Lcom/fefc/kodi/FefcNotifyActivity;->waitingPerm:Z

    if-nez p1, :cond_12

    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->finish()V

    .line 53
    :cond_12
    return-void
.end method

.method public onRequestPermissionsResult(I[Ljava/lang/String;[I)V
    .registers 5

    .line 57
    invoke-super {p0, p1, p2, p3}, Landroid/app/Activity;->onRequestPermissionsResult(I[Ljava/lang/String;[I)V

    .line 59
    :try_start_3
    iget-object p1, p0, Lcom/fefc/kodi/FefcNotifyActivity;->pendingKind:Ljava/lang/String;

    if-eqz p1, :cond_10

    .line 60
    iget-object p2, p0, Lcom/fefc/kodi/FefcNotifyActivity;->pendingTitle:Ljava/lang/String;

    iget-object p3, p0, Lcom/fefc/kodi/FefcNotifyActivity;->pendingText:Ljava/lang/String;

    iget-object v0, p0, Lcom/fefc/kodi/FefcNotifyActivity;->pendingNid:Ljava/lang/String;

    invoke-direct {p0, p1, p2, p3, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->post(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V
    :try_end_10
    .catchall {:try_start_3 .. :try_end_10} :catchall_11

    .line 63
    :cond_10
    goto :goto_12

    .line 62
    :catchall_11
    move-exception p1

    .line 64
    :goto_12
    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->finish()V

    .line 65
    return-void
.end method
