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
    .registers 6

    .line 106
    sget p1, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v0, 0x21

    const/4 v1, 0x0

    const-string v2, "granted"

    const-string v3, "fefc-notify-perm.txt"

    if-ge p1, v0, :cond_f

    invoke-direct {p0, v3, v2}, Lcom/fefc/kodi/FefcNotifyActivity;->writeFile(Ljava/lang/String;Ljava/lang/String;)V

    return v1

    .line 107
    :cond_f
    const-string p1, "android.permission.POST_NOTIFICATIONS"

    invoke-virtual {p0, p1}, Lcom/fefc/kodi/FefcNotifyActivity;->checkSelfPermission(Ljava/lang/String;)I

    move-result v0

    if-nez v0, :cond_1b

    .line 108
    invoke-direct {p0, v3, v2}, Lcom/fefc/kodi/FefcNotifyActivity;->writeFile(Ljava/lang/String;Ljava/lang/String;)V

    return v1

    .line 109
    :cond_1b
    const/4 v0, 0x1

    iput-boolean v0, p0, Lcom/fefc/kodi/FefcNotifyActivity;->waitingPerm:Z

    .line 110
    filled-new-array {p1}, [Ljava/lang/String;

    move-result-object p1

    invoke-virtual {p0, p1, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->requestPermissions([Ljava/lang/String;I)V

    .line 111
    return v0
.end method

.method private handle(Landroid/content/Intent;)V
    .registers 7

    .line 70
    if-nez p1, :cond_3

    return-void

    .line 71
    :cond_3
    invoke-virtual {p1}, Landroid/content/Intent;->getData()Landroid/net/Uri;

    move-result-object p1

    .line 72
    if-nez p1, :cond_a

    return-void

    .line 73
    :cond_a
    invoke-virtual {p1}, Landroid/net/Uri;->getHost()Ljava/lang/String;

    move-result-object v0

    .line 74
    const-string v1, ""

    if-nez v0, :cond_13

    move-object v0, v1

    .line 75
    :cond_13
    const-string v2, "perm"

    invoke-virtual {v2, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v2

    if-eqz v2, :cond_20

    .line 76
    const/4 p1, 0x1

    invoke-direct {p0, p1}, Lcom/fefc/kodi/FefcNotifyActivity;->ensurePerm(Z)Z

    .line 77
    return-void

    .line 79
    :cond_20
    const-string v2, "notify"

    invoke-virtual {v2, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v2

    const-string v3, "files"

    const-string v4, "kind"

    if-eqz v2, :cond_58

    .line 80
    invoke-static {p1, v4, v3}, Lcom/fefc/kodi/FefcNotifyActivity;->q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    .line 81
    const-string v2, "title"

    const-string v3, "FEFC"

    invoke-static {p1, v2, v3}, Lcom/fefc/kodi/FefcNotifyActivity;->q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v2

    .line 82
    const-string v3, "text"

    invoke-static {p1, v3, v1}, Lcom/fefc/kodi/FefcNotifyActivity;->q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object v1

    .line 83
    const-string v3, "nid"

    invoke-static {p1, v3, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object p1

    .line 84
    const/4 v3, 0x0

    invoke-direct {p0, v3}, Lcom/fefc/kodi/FefcNotifyActivity;->ensurePerm(Z)Z

    move-result v3

    if-eqz v3, :cond_54

    .line 85
    iput-object v0, p0, Lcom/fefc/kodi/FefcNotifyActivity;->pendingKind:Ljava/lang/String;

    .line 86
    iput-object v2, p0, Lcom/fefc/kodi/FefcNotifyActivity;->pendingTitle:Ljava/lang/String;

    .line 87
    iput-object v1, p0, Lcom/fefc/kodi/FefcNotifyActivity;->pendingText:Ljava/lang/String;

    .line 88
    iput-object p1, p0, Lcom/fefc/kodi/FefcNotifyActivity;->pendingNid:Ljava/lang/String;

    .line 89
    return-void

    .line 91
    :cond_54
    invoke-direct {p0, v0, v2, v1, p1}, Lcom/fefc/kodi/FefcNotifyActivity;->post(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V

    goto :goto_6b

    .line 92
    :cond_58
    const-string v1, "open"

    invoke-virtual {v1, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_6b

    .line 93
    invoke-static {p1, v4, v3}, Lcom/fefc/kodi/FefcNotifyActivity;->q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;

    move-result-object p1

    .line 94
    invoke-direct {p0, p1}, Lcom/fefc/kodi/FefcNotifyActivity;->writePending(Ljava/lang/String;)V

    .line 95
    invoke-direct {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->launchMain()V

    goto :goto_6c

    .line 92
    :cond_6b
    :goto_6b
    nop

    .line 97
    :goto_6c
    return-void
.end method

.method private launchMain()V
    .registers 3

    .line 174
    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->getPackageManager()Landroid/content/pm/PackageManager;

    move-result-object v0

    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->getPackageName()Ljava/lang/String;

    move-result-object v1

    invoke-virtual {v0, v1}, Landroid/content/pm/PackageManager;->getLaunchIntentForPackage(Ljava/lang/String;)Landroid/content/Intent;

    move-result-object v0

    .line 175
    if-nez v0, :cond_21

    .line 176
    new-instance v0, Landroid/content/Intent;

    const-string v1, "android.intent.action.MAIN"

    invoke-direct {v0, v1}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V

    .line 177
    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->getPackageName()Ljava/lang/String;

    move-result-object v1

    invoke-virtual {v0, v1}, Landroid/content/Intent;->setPackage(Ljava/lang/String;)Landroid/content/Intent;

    .line 178
    const-string v1, "android.intent.category.LAUNCHER"

    invoke-virtual {v0, v1}, Landroid/content/Intent;->addCategory(Ljava/lang/String;)Landroid/content/Intent;

    .line 180
    :cond_21
    const/high16 v1, 0x10200000

    invoke-virtual {v0, v1}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;

    .line 181
    invoke-virtual {p0, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->startActivity(Landroid/content/Intent;)V

    .line 182
    return-void
.end method

.method private post(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V
    .registers 11

    .line 115
    const-string v0, "notification"

    invoke-virtual {p0, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v0

    check-cast v0, Landroid/app/NotificationManager;

    .line 116
    if-nez v0, :cond_b

    return-void

    .line 117
    :cond_b
    sget v1, Landroid/os/Build$VERSION;->SDK_INT:I

    const-string v2, "fefc"

    const/16 v3, 0x1a

    if-lt v1, v3, :cond_23

    .line 118
    new-instance v1, Landroid/app/NotificationChannel;

    const-string v4, "FEFC"

    const/4 v5, 0x3

    invoke-direct {v1, v2, v4, v5}, Landroid/app/NotificationChannel;-><init>(Ljava/lang/String;Ljava/lang/CharSequence;I)V

    .line 119
    const-string v4, "Fan Edit Fan Club Collection"

    invoke-virtual {v1, v4}, Landroid/app/NotificationChannel;->setDescription(Ljava/lang/String;)V

    .line 120
    invoke-virtual {v0, v1}, Landroid/app/NotificationManager;->createNotificationChannel(Landroid/app/NotificationChannel;)V

    .line 122
    :cond_23
    new-instance v1, Landroid/content/Intent;

    const-class v4, Lcom/fefc/kodi/FefcNotifyActivity;

    invoke-direct {v1, p0, v4}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    .line 123
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

    .line 124
    const/high16 p1, 0x14000000

    invoke-virtual {v1, p1}, Landroid/content/Intent;->setFlags(I)Landroid/content/Intent;

    .line 125
    nop

    .line 126
    sget p1, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v4, 0x17

    if-lt p1, v4, :cond_57

    const/high16 p1, 0xc000000

    goto :goto_59

    :cond_57
    const/high16 p1, 0x8000000

    .line 127
    :goto_59
    invoke-virtual {p4}, Ljava/lang/String;->hashCode()I

    move-result p4

    .line 128
    invoke-static {p0, p4, v1, p1}, Landroid/app/PendingIntent;->getActivity(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;

    move-result-object p1

    .line 131
    sget v1, Landroid/os/Build$VERSION;->SDK_INT:I

    if-lt v1, v3, :cond_6b

    .line 132
    new-instance v1, Landroid/app/Notification$Builder;

    invoke-direct {v1, p0, v2}, Landroid/app/Notification$Builder;-><init>(Landroid/content/Context;Ljava/lang/String;)V

    goto :goto_70

    .line 134
    :cond_6b
    new-instance v1, Landroid/app/Notification$Builder;

    invoke-direct {v1, p0}, Landroid/app/Notification$Builder;-><init>(Landroid/content/Context;)V

    .line 136
    :goto_70
    invoke-virtual {v1, p2}, Landroid/app/Notification$Builder;->setContentTitle(Ljava/lang/CharSequence;)Landroid/app/Notification$Builder;

    move-result-object p2

    .line 137
    invoke-virtual {p2, p3}, Landroid/app/Notification$Builder;->setContentText(Ljava/lang/CharSequence;)Landroid/app/Notification$Builder;

    move-result-object p2

    new-instance v2, Landroid/app/Notification$BigTextStyle;

    invoke-direct {v2}, Landroid/app/Notification$BigTextStyle;-><init>()V

    .line 138
    invoke-virtual {v2, p3}, Landroid/app/Notification$BigTextStyle;->bigText(Ljava/lang/CharSequence;)Landroid/app/Notification$BigTextStyle;

    move-result-object p3

    invoke-virtual {p2, p3}, Landroid/app/Notification$Builder;->setStyle(Landroid/app/Notification$Style;)Landroid/app/Notification$Builder;

    move-result-object p2

    .line 139
    const p3, 0x108009b

    invoke-virtual {p2, p3}, Landroid/app/Notification$Builder;->setSmallIcon(I)Landroid/app/Notification$Builder;

    move-result-object p2

    .line 140
    const/4 p3, 0x1

    invoke-virtual {p2, p3}, Landroid/app/Notification$Builder;->setAutoCancel(Z)Landroid/app/Notification$Builder;

    move-result-object p2

    .line 141
    invoke-virtual {p2, p1}, Landroid/app/Notification$Builder;->setContentIntent(Landroid/app/PendingIntent;)Landroid/app/Notification$Builder;

    .line 142
    sget p1, Landroid/os/Build$VERSION;->SDK_INT:I

    if-ge p1, v3, :cond_9c

    .line 143
    const/4 p1, 0x0

    invoke-virtual {v1, p1}, Landroid/app/Notification$Builder;->setPriority(I)Landroid/app/Notification$Builder;

    .line 145
    :cond_9c
    invoke-virtual {v1}, Landroid/app/Notification$Builder;->build()Landroid/app/Notification;

    move-result-object p1

    invoke-virtual {v0, p4, p1}, Landroid/app/NotificationManager;->notify(ILandroid/app/Notification;)V

    .line 146
    return-void
.end method

.method private static q(Landroid/net/Uri;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;
    .registers 3

    .line 100
    invoke-virtual {p0, p1}, Landroid/net/Uri;->getQueryParameter(Ljava/lang/String;)Ljava/lang/String;

    move-result-object p0

    .line 101
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

.method private writeFile(Ljava/lang/String;Ljava/lang/String;)V
    .registers 6

    .line 149
    const/4 v0, 0x0

    invoke-virtual {p0, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->getExternalFilesDir(Ljava/lang/String;)Ljava/io/File;

    move-result-object v0

    .line 150
    if-nez v0, :cond_b

    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->getFilesDir()Ljava/io/File;

    move-result-object v0

    .line 151
    :cond_b
    if-nez v0, :cond_e

    return-void

    .line 153
    :cond_e
    :try_start_e
    new-instance v1, Ljava/io/FileOutputStream;

    new-instance v2, Ljava/io/File;

    invoke-direct {v2, v0, p1}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V

    invoke-direct {v1, v2}, Ljava/io/FileOutputStream;-><init>(Ljava/io/File;)V

    .line 154
    sget-object p1, Ljava/nio/charset/StandardCharsets;->UTF_8:Ljava/nio/charset/Charset;

    invoke-virtual {p2, p1}, Ljava/lang/String;->getBytes(Ljava/nio/charset/Charset;)[B

    move-result-object p1

    invoke-virtual {v1, p1}, Ljava/io/FileOutputStream;->write([B)V

    .line 155
    invoke-virtual {v1}, Ljava/io/FileOutputStream;->close()V
    :try_end_24
    .catch Ljava/lang/Exception; {:try_start_e .. :try_end_24} :catch_25

    .line 157
    goto :goto_26

    .line 156
    :catch_25
    move-exception p1

    .line 158
    :goto_26
    return-void
.end method

.method private writePending(Ljava/lang/String;)V
    .registers 5

    .line 161
    const/4 v0, 0x0

    invoke-virtual {p0, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->getExternalFilesDir(Ljava/lang/String;)Ljava/io/File;

    move-result-object v0

    .line 162
    if-nez v0, :cond_b

    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->getFilesDir()Ljava/io/File;

    move-result-object v0

    .line 163
    :cond_b
    if-nez v0, :cond_e

    return-void

    .line 164
    :cond_e
    new-instance v1, Ljava/io/File;

    const-string v2, "fefc-pending-nav.txt"

    invoke-direct {v1, v0, v2}, Ljava/io/File;-><init>(Ljava/io/File;Ljava/lang/String;)V

    .line 166
    :try_start_15
    new-instance v0, Ljava/io/FileOutputStream;

    invoke-direct {v0, v1}, Ljava/io/FileOutputStream;-><init>(Ljava/io/File;)V

    .line 167
    sget-object v1, Ljava/nio/charset/StandardCharsets;->UTF_8:Ljava/nio/charset/Charset;

    invoke-virtual {p1, v1}, Ljava/lang/String;->getBytes(Ljava/nio/charset/Charset;)[B

    move-result-object p1

    invoke-virtual {v0, p1}, Ljava/io/FileOutputStream;->write([B)V

    .line 168
    invoke-virtual {v0}, Ljava/io/FileOutputStream;->close()V
    :try_end_26
    .catch Ljava/lang/Exception; {:try_start_15 .. :try_end_26} :catch_27

    .line 170
    goto :goto_28

    .line 169
    :catch_27
    move-exception p1

    .line 171
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

    .line 58
    const/4 p1, 0x0

    if-eqz p3, :cond_e

    array-length p2, p3

    if-lez p2, :cond_e

    aget p2, p3, p1

    if-nez p2, :cond_e

    const/4 p1, 0x1

    .line 59
    :cond_e
    if-eqz p1, :cond_13

    const-string p1, "granted"

    goto :goto_15

    :cond_13
    const-string p1, "denied"

    :goto_15
    const-string p2, "fefc-notify-perm.txt"

    invoke-direct {p0, p2, p1}, Lcom/fefc/kodi/FefcNotifyActivity;->writeFile(Ljava/lang/String;Ljava/lang/String;)V

    .line 61
    :try_start_1a
    iget-object p1, p0, Lcom/fefc/kodi/FefcNotifyActivity;->pendingKind:Ljava/lang/String;

    if-eqz p1, :cond_27

    .line 62
    iget-object p2, p0, Lcom/fefc/kodi/FefcNotifyActivity;->pendingTitle:Ljava/lang/String;

    iget-object p3, p0, Lcom/fefc/kodi/FefcNotifyActivity;->pendingText:Ljava/lang/String;

    iget-object v0, p0, Lcom/fefc/kodi/FefcNotifyActivity;->pendingNid:Ljava/lang/String;

    invoke-direct {p0, p1, p2, p3, v0}, Lcom/fefc/kodi/FefcNotifyActivity;->post(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V
    :try_end_27
    .catchall {:try_start_1a .. :try_end_27} :catchall_28

    .line 65
    :cond_27
    goto :goto_29

    .line 64
    :catchall_28
    move-exception p1

    .line 66
    :goto_29
    invoke-virtual {p0}, Lcom/fefc/kodi/FefcNotifyActivity;->finish()V

    .line 67
    return-void
.end method
